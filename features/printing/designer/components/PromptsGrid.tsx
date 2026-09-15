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
 *
 * NOTHING ASKS THE OPERATOR ANYTHING YET, and every warning below turns on it.
 * A document print (`PrintOptionsDialog`) posts the revision, the document and
 * the document's accounting year -- no answers, because company, branch, counter
 * and user are claims on the access token. So a prompt under a name the render
 * does not fill by itself cannot be answered by anyone: REQUIRED, it fails the
 * render outright ("'X' is required by this revision and was not answered");
 * optional, it binds NULL and the query matches no row. Declaring a bound name
 * is therefore the WRONG repair for a query that binds `:comp_id` -- the repair
 * is to bind `:company_id`, which is why `suggestContextParam` splits the
 * undeclared list in two before anything offers to declare it.
 */

import {
  CONTEXT_PARAMS,
  contextParam,
  hasContextDefault,
  isServerOwnedParam,
  suggestContextParam,
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
  const undeclared = [...bound].filter(
    (name) => !hasContextDefault(name) && !declared.has(name),
  );
  // Of those, the ones that are a context name under another spelling. They are
  // reported separately and are NOT offered to the declare button: declaring
  // `:comp_id` is what produces a prompt no screen can answer, and the repair
  // belongs in the query.
  const misspelt = undeclared
    .map((name) => ({ name, context: suggestContextParam(name) }))
    .filter(
      (entry): entry is { name: string; context: string } =>
        entry.context !== undefined,
    );
  const misspeltNames = new Set(misspelt.map((entry) => entry.name));
  const undeclarable = undeclared.filter((name) => !misspeltNames.has(name));

  const patch = (index: number, next: Partial<PtvParam>) =>
    onChange(
      params.map((parameter, position) =>
        position === index ? { ...parameter, ...next } : parameter,
      ),
    );

  const addRow = () =>
    onChange([
      ...params,
      { name: "", type: "TEXT", required: false, label: null },
    ]);

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
              const context = shapeOk
                ? contextParam(parameter.name)
                : undefined;
              const serverOwned = shapeOk && isServerOwnedParam(parameter.name);
              const unused =
                shapeOk && bound.size > 0 && !bound.has(parameter.name);
              const suggestion = shapeOk
                ? suggestContextParam(parameter.name)
                : undefined;

              return (
                <tr key={index}>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={parameter.name}
                      disabled={readOnly}
                      data-uppercase="off"
                      placeholder="from_date"
                      onChange={(event) =>
                        patch(index, { name: event.target.value.trim() })
                      }
                    />
                    {!shapeOk && parameter.name ? (
                      <span className={styles.cellFinding}>
                        Lower snake case, starting with a letter.
                      </span>
                    ) : null}
                    {context && !serverOwned ? (
                      <span className={styles.cellNote}>
                        {context.what}. The render supplies :{parameter.name} on
                        its own, so declaring it here is an OVERRIDE — what the
                        operator answers is what the queries bind, and a blank
                        answer falls back to the render&apos;s own value.
                      </span>
                    ) : null}
                    {serverOwned ? (
                      <span className={styles.cellFinding}>
                        :{parameter.name} always binds the signed-in company,
                        whatever is answered here — a render that took it from
                        the caller would read another company&apos;s documents.
                        Declare it to document the binding, not to change it.
                      </span>
                    ) : null}
                    {unused ? (
                      <span className={styles.cellFinding}>
                        No query on this revision binds it, so the answer goes
                        nowhere.
                      </span>
                    ) : null}
                    {shapeOk && !context ? (
                      <span className={styles.cellFinding}>
                        Nothing answers this. A print sends the document and
                        nothing else, so{" "}
                        {parameter.required === true
                          ? "a required prompt fails the render: “" +
                            (parameter.label || parameter.name) +
                            "” is required by this revision and was not answered."
                          : "an unanswered prompt binds NULL, and a query filtering on it matches no row."}
                        {suggestion
                          ? ` Did you mean :${suggestion}? Bind that in the query and delete this row — the render fills it in.`
                          : " Bind a context name in the query instead, or give the query a literal."}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className={styles.cellSelect}
                      value={parameter.type}
                      disabled={readOnly}
                      onChange={(event) =>
                        patch(index, {
                          type: event.target.value as PtvParam["type"],
                        })
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
                      onChange={(event) =>
                        patch(index, { required: event.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={parameter.label ?? ""}
                      disabled={readOnly}
                      placeholder="From date"
                      onChange={(event) =>
                        patch(index, { label: event.target.value || null })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.link}
                      disabled={readOnly}
                      onClick={() =>
                        onChange(
                          params.filter((_, position) => position !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}

            <tr
              className={styles.ghostRow}
              onClick={() => !readOnly && addRow()}
            >
              <td colSpan={5}>
                {readOnly ? "This revision is read-only." : "add a row…"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {misspelt.length > 0 ? (
        <Note tone="amber">
          {misspelt
            .map((entry) => `:${entry.name} → :${entry.context}`)
            .join(", ")}
          . {misspelt.length === 1 ? "That name is" : "Those names are"} a
          context name spelt another way. Change{" "}
          {misspelt.length === 1 ? "it" : "them"} in the QUERY rather than
          declaring {misspelt.length === 1 ? "it" : "them"} here: the render
          fills a context name in on its own, and a prompt is something a screen
          would have to ask for — which no print screen does.
        </Note>
      ) : null}

      {undeclarable.length > 0 ? (
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
                  ...undeclarable.map((name) => ({
                    name,
                    type: "TEXT" as const,
                    // Optional, NOT required. Nothing answers prompts today, and
                    // a required one is a render that cannot succeed rather than
                    // a report that comes back blank.
                    required: false,
                    label: null,
                  })),
                ])
              }
            >
              Declare {undeclarable.length === 1 ? "it" : "them"}
            </button>
          }
        >
          {undeclarable.map((name) => `:${name}`).join(", ")}{" "}
          {undeclarable.length === 1
            ? "is bound by a query"
            : "are bound by queries"}{" "}
          on this revision but declared nowhere, so the render refuses the query
          outright. Declaring {undeclarable.length === 1 ? "it" : "them"} makes
          the query bindable, but no print screen asks an operator anything
          today — {undeclarable.length === 1 ? "it binds" : "they bind"} NULL
          until one does. Where the query means the document, the company or the
          year, bind{" "}
          {CONTEXT_PARAMS.map((parameter) => `:${parameter.name}`).join(", ")}{" "}
          instead.
        </Note>
      ) : null}

      <Note>
        An invoice normally has none of these. They are for reports — and for
        the one other thing this table is now for: overriding what the render
        would otherwise supply on its own.{" "}
        {CONTEXT_PARAMS.map((parameter) => `:${parameter.name}`).join(", ")}{" "}
        bind without being declared, so a query may use them as they stand;
        declare one only to have the operator answer it instead.
      </Note>
    </section>
  );
}
