import { describe, expect, it } from "vitest";

import { collectSqlFindings, extractBoundParams, normalizeDatasetSql } from "./sqlLint";

/** One rule per case, asked by name so a message reword does not break the test. */
const rules = (sql: string, requiresCompany = false): string[] =>
  collectSqlFindings(sql, requiresCompany).map((finding) => finding.rule);

const GOOD = "SELECT sbi_item_name, sbi_qty FROM sale_bill_items WHERE sbi_comp_id = :company_id";

describe("a good query passes cleanly", () => {
  it("has no findings", () => {
    expect(collectSqlFindings(GOOD, true)).toEqual([]);
  });

  it("passes with a single trailing semicolon", () => {
    expect(collectSqlFindings(`${GOOD};`, true)).toEqual([]);
  });

  it("passes when it starts with WITH", () => {
    expect(
      collectSqlFindings(`WITH x AS (SELECT 1 AS a) SELECT a FROM x WHERE a = :company_id`, true),
    ).toEqual([]);
  });

  it("passes a parenthesised union", () => {
    expect(
      rules("(SELECT a FROM t WHERE c = :company_id) UNION (SELECT a FROM u)", true),
    ).toEqual([]);
  });
});

describe("ck_ptd_sql_size", () => {
  it("refuses something too short, and reports nothing else about it", () => {
    expect(rules("SELECT 1")).toEqual(["ck_ptd_sql_size"]);
  });
});

describe("ck_ptd_sql_read_only_start / no_write", () => {
  it("refuses a query that does not start with SELECT or WITH", () => {
    expect(rules("UPDATE t SET a = 1 WHERE b = 2 AND c = 3")).toContain(
      "ck_ptd_sql_read_only_start",
    );
  });

  it("refuses a data-modifying CTE", () => {
    expect(
      rules("WITH d AS (DELETE FROM t WHERE a = 1 RETURNING *) SELECT * FROM d"),
    ).toContain("ck_ptd_sql_no_write");
  });

  it("does not fire on a column name that merely contains a keyword", () => {
    expect(rules("SELECT last_updated_on, deleted_flag FROM t WHERE c = :company_id")).toEqual([]);
  });
});

describe("ck_ptd_sql_single_statement", () => {
  it("refuses a second statement", () => {
    expect(rules(`${GOOD}; SELECT 1 FROM other_table`)).toContain(
      "ck_ptd_sql_single_statement",
    );
  });

  it("allows a semicolon inside a literal, which is a token by then", () => {
    expect(rules("SELECT a FROM t WHERE b = 'x;y' AND c = :company_id")).toEqual([]);
  });
});

describe("ck_ptd_sql_no_dollar_quote", () => {
  it("refuses dollar quoting, which hides text from every other check", () => {
    expect(rules("SELECT $$anything at all here$$ AS a FROM t")).toContain(
      "ck_ptd_sql_no_dollar_quote",
    );
  });
});

describe("ck_ptd_sql_normalised", () => {
  it("refuses an unclosed literal", () => {
    expect(rules("SELECT a FROM t WHERE b = 'unclosed AND c = 1")).toContain(
      "ck_ptd_sql_normalised",
    );
  });

  it("accepts a doubled apostrophe inside a literal", () => {
    expect(rules("SELECT a FROM t WHERE b = 'it''s fine' AND c = :company_id")).toEqual([]);
  });
});

describe("ck_ptd_sql_param_shape", () => {
  it("refuses a colon that is not a parameter", () => {
    expect(rules("SELECT arr[2:5] AS a FROM t WHERE c = :company_id")).toContain(
      "ck_ptd_sql_param_shape",
    );
  });

  it("does not fire on a cast, which the normaliser flattens", () => {
    expect(rules("SELECT a::text AS a FROM t WHERE c = :company_id")).toEqual([]);
  });
});

describe("ck_ptd_sql_no_quoted_param — the 3.0 bug", () => {
  /*
   * The two subtle cases the plan calls out. Both turn on the SAME counting
   * rule, in opposite directions.
   */

  it("PASSES a literal that appears BEFORE a real parameter", () => {
    // The literal contains no :name, so raw and normalised counts agree.
    const sql = "SELECT a FROM t WHERE kind = 'RETAIL' AND comp = :company_id";

    expect(rules(sql, true)).toEqual([]);
  });

  it("FAILS a :name written INSIDE a literal", () => {
    // 3.0 stored ':iacc_year' with the quotes in the SQL, because parameters
    // were a string replace rather than a binding.
    const sql = "SELECT a FROM t WHERE yr = ':acc_year' AND comp = :company_id";

    expect(rules(sql, true)).toContain("ck_ptd_sql_no_quoted_param");
  });

  it("FAILS a :name mentioned only in a line comment — the accepted false positive", () => {
    const sql = `SELECT a FROM t WHERE comp = :company_id -- also filter by :branch_id one day`;

    expect(rules(sql, true)).toContain("ck_ptd_sql_no_quoted_param");
  });

  it("does not fire on a query with no parameters at all", () => {
    expect(rules("SELECT state_code, state_name FROM state_codes ORDER BY state_code")).toEqual([]);
  });
});

describe("ck_ptd_sql_company_scoped", () => {
  it("refuses an unscoped query when the dataset requires a company", () => {
    expect(rules("SELECT a FROM t WHERE b = 1 ORDER BY a", true)).toContain(
      "ck_ptd_sql_company_scoped",
    );
  });

  it("allows an unscoped query for genuinely global data", () => {
    expect(rules("SELECT state_code FROM state_codes ORDER BY state_code", false)).toEqual([]);
  });

  it("does not accept :company_id hidden inside a literal", () => {
    const sql = "SELECT a FROM t WHERE note = 'uses :company_id' AND b = 1";
    const found = rules(sql, true);

    expect(found).toContain("ck_ptd_sql_company_scoped");
    expect(found).toContain("ck_ptd_sql_no_quoted_param");
  });
});

describe("ck_ptd_sql_no_escape", () => {
  it("refuses a reach outside the query", () => {
    expect(rules("SELECT pg_read_file('/etc/passwd') AS a FROM t")).toContain(
      "ck_ptd_sql_no_escape",
    );
  });
});

describe("normalizeDatasetSql matches the generated column", () => {
  it("strips comments before literals", () => {
    expect(normalizeDatasetSql("SELECT 1 -- it's a note\nFROM t")).toBe("select 1  \nfrom t");
  });

  it("tokenises literals and quoted identifiers, and flattens casts", () => {
    expect(normalizeDatasetSql(`SELECT 'a'::text AS "B" FROM t`)).toBe(
      "select  @lit  text as  @id  from t",
    );
  });

  it("reads null and undefined as empty", () => {
    expect(normalizeDatasetSql(null)).toBe("");
    expect(normalizeDatasetSql(undefined)).toBe("");
  });
});

describe("extractBoundParams", () => {
  it("finds each bound name once, in first-appearance order", () => {
    expect(
      extractBoundParams("SELECT a FROM t WHERE c = :company_id AND d > :from_date AND e = :company_id"),
    ).toEqual(["company_id", "from_date"]);
  });

  it("ignores a name inside a literal or a comment — it reads the normalised text", () => {
    expect(
      extractBoundParams("SELECT a FROM t WHERE b = ':not_bound' -- nor :this_one\n AND c = :company_id"),
    ).toEqual(["company_id"]);
  });

  it("is not confused by a cast", () => {
    expect(extractBoundParams("SELECT a::text FROM t WHERE c = :company_id")).toEqual([
      "company_id",
    ]);
  });
});
