"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useApi } from "@/hooks/useApi";
import { RESOLVE_ENDPOINT, SUPPLY_NATURE_OPTIONS } from "./constants";
import type { TaxRateResolution, TaxRateResolvedLedger } from "./types";

/**
 * "Where this rate actually posts" — read-only, and the only honest way to show
 * it.
 *
 * The grid above shows the overrides this rate carries and says nothing about
 * the rest. `/tax-rates/resolve` asks the resolver the question posting will ask,
 * for every role the catalogue marks `alr_by_rate`, and answers with a `source`:
 *
 *   OVERRIDE  this rate carries a row of its own
 *   DEFAULT   it inherits accounts.acc_ledger_map
 *   UNMAPPED  neither answers — a voucher touching this role cannot be posted
 *
 * The fallback is NEVER computed client-side: keeping the two-level resolution in
 * one place, on the server, is the point. Round-off, discount, write-off and
 * advances are deliberately absent — they have one answer for the whole business
 * and a rate has no opinion about them.
 *
 * Everything reads UNMAPPED until `accounts.acc_ledger_map` has rows, and nothing
 * can write that table yet. That is the true answer, not a defect in this panel.
 */

export type ResolvePanelProps = {
  /** Null while creating — there is nothing to resolve until the rate exists. */
  taxId: string | null;
};

const wrapperStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  rowGap: "0.6rem",
};
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};
const hintStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  lineHeight: 1.45,
  margin: 0,
};
const natureSelectStyle: CSSProperties = {
  padding: "0.32rem 0.45rem",
  border: "1px solid #d8e1ea",
  borderRadius: "0.35rem",
  fontSize: "0.78rem",
  background: "#fff",
};
const tableScrollStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--erp-modal-border, #cfdae6)",
  borderRadius: "0.5rem",
};
const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.8rem",
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.45rem 0.55rem",
  background: "#f1f5f9",
  color: "#334155",
  fontWeight: 700,
  fontSize: "0.72rem",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #d8e1ea",
};
const tdStyle: CSSProperties = {
  padding: "0.35rem 0.55rem",
  borderBottom: "1px solid #eef2f7",
};
const messageStyle: CSSProperties = {
  padding: "0.9rem 0.75rem",
  textAlign: "center",
  color: "#64748b",
  fontSize: "0.78rem",
};

const SOURCE_STYLES: Record<TaxRateResolvedLedger["source"], CSSProperties> = {
  OVERRIDE: { color: "#1d4ed8", fontWeight: 600 },
  DEFAULT: { color: "#475569" },
  UNMAPPED: { color: "#b45309", fontWeight: 600 },
};
const SOURCE_LABELS: Record<TaxRateResolvedLedger["source"], string> = {
  OVERRIDE: "This rate",
  DEFAULT: "Ledger map",
  UNMAPPED: "Unmapped",
};

function extractResolution(payload: unknown): TaxRateResolution | null {
  const body = (payload ?? {}) as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  return Array.isArray(data?.roles) ? (data as unknown as TaxRateResolution) : null;
}

export default function ResolvePanel({ taxId }: ResolvePanelProps) {
  const { getAll } = useApi<unknown>(RESOLVE_ENDPOINT);
  const [supplyNature, setSupplyNature] = useState("");
  /**
   * One state for the answer, stamped with the question it answers.
   *
   * Busy is then `answer.key !== queryKey` rather than a flag flipped before the
   * request — which keeps the effect free of a synchronous setState, and makes a
   * reply that arrives after the nature changed impossible to render under the
   * new question.
   */
  const [answer, setAnswer] = useState<{
    key: string;
    resolution: TaxRateResolution | null;
    errorMessage: string | null;
  } | null>(null);

  const queryKey = taxId ? `${taxId}|${supplyNature}` : "";

  const load = useCallback(async () => {
    if (!taxId) {
      return;
    }
    const key = `${taxId}|${supplyNature}`;
    try {
      const payload = await getAll({
        tax_id: taxId,
        ...(supplyNature ? { supply_nature: supplyNature } : {}),
      });
      setAnswer({ key, resolution: extractResolution(payload), errorMessage: null });
    } catch {
      setAnswer({
        key,
        resolution: null,
        errorMessage: "Unable to resolve where this rate posts.",
      });
    }
  }, [getAll, supplyNature, taxId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = answer?.key === queryKey ? answer : null;
  const loading = Boolean(taxId) && current === null;
  const errorMessage = current?.errorMessage ?? null;
  const roles = current?.resolution?.roles ?? [];

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <p style={hintStyle}>
          Where this rate posts once the overrides above and the chart-wide posting
          ledger map are both taken into account. Read-only.
        </p>
        <label style={{ ...hintStyle, display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
          Resolve for
          <select
            style={natureSelectStyle}
            value={supplyNature}
            disabled={!taxId}
            aria-label="Supply nature to resolve for"
            onChange={(event) => setSupplyNature(event.target.value)}
          >
            {SUPPLY_NATURE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Group</th>
              <th style={thStyle}>Posts to</th>
              <th style={thStyle}>Answered by</th>
            </tr>
          </thead>
          <tbody>
            {!taxId ? (
              <tr>
                <td colSpan={4} style={messageStyle}>
                  Save the rate first — there is nothing to resolve until it exists.
                </td>
              </tr>
            ) : null}
            {taxId && loading && roles.length === 0 ? (
              <tr>
                <td colSpan={4} style={messageStyle}>
                  Resolving…
                </td>
              </tr>
            ) : null}
            {taxId && !loading && errorMessage ? (
              <tr>
                <td colSpan={4} style={{ ...messageStyle, color: "#dc2626" }}>
                  {errorMessage}
                </td>
              </tr>
            ) : null}
            {roles.map((entry) => (
              <tr key={`${entry.role}-${entry.supply_nature ?? ""}`}>
                <td style={tdStyle}>{entry.role_label || entry.role}</td>
                <td style={tdStyle}>{entry.role_group}</td>
                <td style={tdStyle}>
                  {entry.ledger_name ?? (
                    <span style={SOURCE_STYLES.UNMAPPED}>nothing yet</span>
                  )}
                </td>
                <td style={{ ...tdStyle, ...SOURCE_STYLES[entry.source] }}>
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
