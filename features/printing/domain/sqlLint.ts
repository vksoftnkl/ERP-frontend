/**
 * The stored-SQL guards, mirrored from the server so a template author is told
 * what is wrong WHILE TYPING rather than by a 400 after a save.
 *
 * -- THIS IS A LINT. THE SERVER IS THE AUTHORITY. --------------------------
 *
 * Every guard below exists three times: as a CHECK constraint in
 * 17_printing.sql, as `collectDatasetSqlErrors` in the server's
 * `print-template-sql-guards.ts`, and here. This copy is the one that can be
 * wrong -- it runs on unsaved text and has no database to recompute
 * `ptd_sql_norm` with. Nothing may be saved because this file approved it, and
 * nothing may be blocked from being SENT because this file objected: the screen
 * shows these as warnings and lets the server refuse.
 *
 * None of the three is a security boundary. That is three runtime facts on the
 * server and none of them live in any lint: parameters BOUND over the extended
 * protocol (which makes a second statement structurally impossible rather than
 * merely filtered), the query run in a READ ONLY transaction, and a role with
 * no write privilege. A regex cannot parse SQL and never will.
 *
 * What this buys is the message. `ck_ptd_sql_no_quoted_param` is an accurate
 * and unreadable thing to see in a toast; every guard here returns a sentence
 * that says what to change.
 *
 * Ported field for field from the server file. Keep them in step.
 */

export const SQL_MIN_LENGTH = 20;
export const SQL_MAX_LENGTH = 20_000;

export type SqlLintFinding = { rule: string; message: string };

/**
 * `ptd_sql_norm`, exactly as the GENERATED ALWAYS expression computes it.
 *
 * Order is load-bearing: comments are stripped BEFORE literals, because a stray
 * quote inside a comment would otherwise mispair the literal scanner. The
 * reverse case -- a `--` inside a literal -- mangles the residue, which can only
 * FAIL a good query, never pass a bad one. Failing closed is the right
 * direction, and `collectSqlFindings` says so in the two messages where an
 * author is most likely to meet it.
 *
 * The PostgreSQL flags map onto JavaScript as:
 *   '/\* ... *\/'  'g'   -- not newline-sensitive, so '.' spans newlines -> [\s\S]
 *   '--.*$'        'gn'  -- newline-sensitive, '$' at each line end      -> m
 */
export function normalizeDatasetSql(sql: string | null | undefined): string {
  return (sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // 1. block comment
    .replace(/--.*$/gm, " ") // 2. line comment
    .replace(/'(?:[^']|'')*'/g, " @lit ") // 3. 'literal', '' escape included
    .replace(/"[^"]*"/g, " @id ") // 4. "quoted identifier"
    .replace(/::/g, " ") // 5. casts flattened
    .toLowerCase();
}

/** `regexp_count(subject, pattern)` -- Postgres 15+, and there is no JS built-in. */
function countMatches(subject: string, pattern: RegExp): number {
  return subject.match(pattern)?.length ?? 0;
}

/**
 * Every guard, in the order the constraints are declared, collected rather than
 * short-circuited so one bad query is answered with all of its problems.
 */
export function collectSqlFindings(sql: string, requiresCompany: boolean): SqlLintFinding[] {
  const findings: SqlLintFinding[] = [];
  const norm = normalizeDatasetSql(sql);
  const push = (rule: string, message: string): void => {
    findings.push({ rule, message });
  };

  // ck_ptd_sql_size -- checked first: everything below reads better against a
  // query that is at least plausibly a query.
  if (sql.length < SQL_MIN_LENGTH || sql.length > SQL_MAX_LENGTH) {
    push(
      "ck_ptd_sql_size",
      `The query must be between ${SQL_MIN_LENGTH} and ${SQL_MAX_LENGTH} characters (this one is ${sql.length}).`,
    );
    // A 3-character "sql" fails almost every guard below for no useful reason.
    return findings;
  }

  // ck_ptd_sql_no_dollar_quote. Against the RAW text: dollar quoting defeats the
  // literal scanner outright, so by the time it reaches the norm the damage is
  // already done.
  if (/\$[A-Za-z_0-9]*\$/.test(sql)) {
    push(
      "ck_ptd_sql_no_dollar_quote",
      "Dollar quoting ($$ … $$) is not allowed — it hides text from the normaliser that every other check reads. Use ordinary '…' literals.",
    );
  }

  // ck_ptd_sql_normalised. Nothing may survive the normaliser: a quote left in
  // the residue means the scanner mispaired something, so refuse rather than
  // guess what the query means.
  if (norm.includes("'") || norm.includes('"')) {
    push(
      "ck_ptd_sql_normalised",
      "An unpaired quote survived normalisation. Check that every '…' literal is closed, that a literal apostrophe is doubled ('it''s'), and that every \"identifier\" is closed.",
    );
  }

  // ck_ptd_sql_no_residual_comment
  if (/\/\*|\*\//.test(norm)) {
    push(
      "ck_ptd_sql_no_residual_comment",
      "An unterminated or nested block comment was left behind. PostgreSQL allows /* nested */ comments, which this stripper deliberately does not — remove them.",
    );
  }

  // ck_ptd_sql_single_statement. Literals are already tokens by now, so a
  // semicolon inside a string cannot reach this. One trailing ';' is allowed.
  if (/;/.test(norm.replace(/\s*;\s*$/, ""))) {
    push(
      "ck_ptd_sql_single_statement",
      'Only one statement is allowed. A single trailing ";" is fine, anything after it is not.',
    );
  }

  // ck_ptd_sql_read_only_start. A leading '(' allows (SELECT …) UNION (SELECT …).
  if (!/^\(*\s*(select|with)\b/.test(norm.trim())) {
    push("ck_ptd_sql_read_only_start", "A dataset query must start with SELECT or WITH.");
  }

  // ck_ptd_sql_no_write. With one-statement and SELECT-only already enforced,
  // the only remaining way to write is a data-modifying CTE. The list is short
  // on purpose: a long blacklist is a false-positive machine, and every false
  // refusal teaches somebody to work around the guard.
  const write = norm.match(/\b(insert|update|delete|merge|truncate|copy|grant|revoke)\b/);
  if (write) {
    push(
      "ck_ptd_sql_no_write",
      `A dataset query may not write. Found "${write[1]}" — a data-modifying CTE is still a write. If the word is part of a column name such as last_updated_on, it is safe and this guard did not fire on it.`,
    );
  }

  // ck_ptd_sql_no_escape. A blacklist, and blacklists lose; this exists to make
  // the common mistake loud. The read-only role is what makes it not matter.
  const escape = norm.match(
    /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|dblink_exec|pg_sleep|pg_terminate_backend|pg_cancel_backend|set_config|current_setting|pg_authid|pg_shadow)\b/,
  );
  if (escape) {
    push(
      "ck_ptd_sql_no_escape",
      `"${escape[1]}" reaches outside the query — the filesystem, the network or the catalog — and is not allowed in a dataset query.`,
    );
  }

  // ck_ptd_sql_param_shape. Parameters are :name and nothing else. Known false
  // positive, accepted upstream and repeated here: an array slice arr[2:5].
  if (/:(?![a-z_])/.test(norm)) {
    push(
      "ck_ptd_sql_param_shape",
      'A ":" that is not a parameter. Parameters are :name — lower case, starting with a letter or underscore. Note that an array slice such as arr[2:5] trips this too; rewrite it with a function.',
    );
  }

  // ck_ptd_sql_no_quoted_param -- THE 3.0 BUG, named. Its stored SQL contained
  // ':iacc_year' WITH the quotes inside the SQL, because parameters were a
  // string replace rather than a binding.
  //
  // Counting rather than pattern-matching is what makes it exact: any :name
  // present in the raw text but ABSENT from the norm was inside a literal. A
  // :name inside a '--' comment counts the same way, which the message says.
  if (countMatches(sql.replace(/::/g, " "), /:[A-Za-z_]/g) !== countMatches(norm, /:[A-Za-z_]/g)) {
    push(
      "ck_ptd_sql_no_quoted_param",
      "A parameter is written inside a string literal or a comment. Parameters are BOUND, not pasted: write  x = :company_id , never  x = ':company_id' . (A :name mentioned in a \"--\" comment reads the same way to this check — move it out of the comment.)",
    );
  }

  // ck_ptd_sql_company_scoped -- THE CHECK 3.0 MOST NEEDED AND NOBODY WROTE. In
  // a chain, a query that is not company-scoped shows one company another
  // company's numbers.
  if (requiresCompany && !/:company_id\b/.test(norm)) {
    push(
      "ck_ptd_sql_company_scoped",
      'The query must be company-scoped: bind :company_id somewhere in it. Set "requires company" off only for genuinely global data, such as a state-code list. (If it IS scoped, check for a "--" inside a string literal — that mangles the residue this check reads.)',
    );
  }

  return findings;
}

/**
 * Every `:name` the query binds, in first-appearance order, read off the
 * NORMALISED text so a name inside a literal or a comment is not counted.
 *
 * This is what the prompts grid is checked against.
 */
export function extractBoundParams(sql: string | null | undefined): string[] {
  const norm = normalizeDatasetSql(sql);
  const seen = new Set<string>();
  for (const match of norm.matchAll(/:([a-z_][a-z0-9_]*)/g)) {
    seen.add(match[1]);
  }
  return [...seen];
}
