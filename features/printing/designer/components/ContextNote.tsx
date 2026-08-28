"use client";

/**
 * The six context parameters, as green chips and a read-only note.
 *
 * They are declared NOWHERE -- not in a table, and in no payload. The server
 * holds the registry, holds one fixed type for each, and works out which ones a
 * query uses BY READING THE QUERY, exactly as `ck_ptd_sql_company_scoped`
 * already greps `ptd_sql_norm` for `:company_id`.
 *
 * This section exists solely so an author knows what is already available and
 * does not declare one of them as a USER prompt -- which would make the render
 * stop and ask the operator for something it already knows. Declaring them per
 * dataset would have restated the same six facts on every band.
 */

import { CONTEXT_PARAMS } from "@/features/printing/domain/context";
import { Chip, Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

export default function ContextNote() {
  return (
    <section className={styles.section}>
      <SectionHead
        title="Context"
        qualifier="declared NOWHERE: not in a table, and in no payload"
        slice="(none)"
      />

      <div className={styles.chipRow}>
        {CONTEXT_PARAMS.map((parameter) => (
          <Chip
            key={parameter.name}
            tone="green"
            mono
            title={`${parameter.type} — ${parameter.what}`}
          >
            :{parameter.name}
          </Chip>
        ))}
      </div>

      <Note>
        A closed set: each name with one fixed type forever. The server finds which of them a query
        uses by READING the query — exactly as{" "}
        <span className={styles.mono}>ck_ptd_sql_company_scoped</span> already reads{" "}
        <span className={styles.mono}>ptd_sql_norm</span> looking for{" "}
        <span className={styles.mono}>:company_id</span>. Bind them directly; never declare one as a
        prompt.
      </Note>
    </section>
  );
}
