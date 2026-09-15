"use client";

/**
 * The stored query for the selected dataset, with the authoring guards run as
 * you type.
 *
 * THE FINDINGS ARE A LINT AND NOTHING IS BLOCKED BY THEM. The same ten guards
 * exist as CHECK constraints and again in the server service, and only those two
 * decide anything; this copy exists to turn `ck_ptd_sql_no_quoted_param` into a
 * sentence before a save rather than after one. Nothing here is a security
 * boundary -- that is bound parameters, a READ ONLY transaction and a role with
 * no write privilege, all server-side.
 *
 * `ptdSqlNorm` is shown when the server has one, because every guard reads THAT
 * and not the raw text, so it is what to look at when a guard refuses a query
 * that looks fine.
 */

import { useState } from "react";

import { collectSqlFindings } from "@/features/printing/domain/sqlLint";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

export default function SqlEditor({
  sql,
  datasetNo,
  datasetName,
  sqlNorm,
  readOnly,
  onChange,
}: {
  sql: string;
  datasetNo: number;
  datasetName: string;
  /** GENERATED ALWAYS on the server; absent until the row has been saved once. */
  sqlNorm?: string | null;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  const [showNorm, setShowNorm] = useState(false);
  const findings = sql.trim() ? collectSqlFindings(sql) : [];

  return (
    <section className={styles.section}>
      <SectionHead
        title={`Query for row ${datasetNo}`}
        table="ptd_sql"
        qualifier={datasetName || undefined}
        slice="datasets[].ptdSql"
      />

      <textarea
        className={styles.textarea}
        value={sql}
        disabled={readOnly}
        spellCheck={false}
        data-uppercase="off"
        placeholder="SELECT … FROM … WHERE … = :company_id"
        onChange={(event) => onChange(event.target.value)}
      />

      <div className={styles.toolbar}>
        {sqlNorm ? (
          <button
            type="button"
            className={styles.link}
            onClick={() => setShowNorm((current) => !current)}
          >
            {showNorm ? "Hide" : "Show"} what the checks actually read
          </button>
        ) : null}
      </div>

      {showNorm && sqlNorm ? (
        <textarea className={styles.textarea} value={sqlNorm} readOnly spellCheck={false} />
      ) : null}

      <Note tone="amber">
        One SELECT. Parameters are <span className={styles.mono}>:name</span> and are BOUND — no
        quotes around them.
      </Note>

      {findings.length > 0 ? (
        <ul className={styles.findingList}>
          {findings.map((finding) => (
            <li key={finding.rule}>
              {finding.message} <span className={styles.findingRule}>{finding.rule}</span>
            </li>
          ))}
        </ul>
      ) : sql.trim() ? (
        <Note tone="green">No problems found. The database still has the final word.</Note>
      ) : null}
    </section>
  );
}
