/**
 * Agents Master (menu 28, grid 194) — Qt NexERP 97a5b48 (`purchase/master/agent`).
 * Pure helpers; the screen is `purchase-agent-master.tsx`.
 *
 * Server rules the screen leans on (`purchase/agent/purchase-agent.ts`):
 *  - `POST /purchase/agents/save` creates (no `pagId`) or updates one agent. An
 *    agent IS a ledger: create provisions it under Sundry Creditors with the same
 *    id; a rename renames the ledger. Every text key is written — absent = NULL.
 *  - `POST /purchase/agents/active` switches the agent AND the ledger on / off.
 *    Nothing is deleted: a PO or a bill may name the agent.
 *  - The name is unique per company (409 PUR_AGENT_NAME_EXISTS); PAN / GSTIN
 *    are checked for shape and stored upper-case.
 */

/** Grid 194's tokens are QUOTED in the SQL and both are always sent. */
export function listGridParams(companyId: string, showInactive: boolean): Record<string, string> {
  return { icompany_id: companyId, iinactive: showInactive ? "true" : "false" };
}

export const LOOKUP_KEYS = {
  id: ["pag_id"],
  code: ["pag_code"],
  name: ["pag_name"],
  short: [],
  alias: [],
  active: ["pag_is_active"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** The SaveAgentDto lengths. */
export const MAX_LENGTH = {
  code: 30,
  name: 150,
  alias: 150,
  mobile: 20,
  addr: 200,
  place: 100,
  pincode: 10,
  panNo: 10,
  gstin: 15,
  remarks: 250,
} as const;

/** The server caches a grid run for about a second; a list re-read sooner shows the old row. */
export const RELOAD_AFTER_SAVE_MS = 1200;

export type AgentRow = Record<string, unknown>;

/** The save body's text keys, in the form's order. */
const TEXT_KEYS = [
  "code",
  "alias",
  "mobile1",
  "mobile2",
  "addr1",
  "addr2",
  "city",
  "district",
  "state",
  "pincode",
  "panNo",
  "gstin",
  "remarks",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function rowFlag(row: AgentRow | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const s = text(value).trim().toLowerCase();
  return s === "true" || s === "t" || s === "1" || s === "yes";
}

export const isActive = (row: AgentRow | null | undefined) => rowFlag(row, "pag_is_active");

export const BLANK_VALUES: Record<string, string> = {
  name: "",
  code: "",
  alias: "",
  defaultCommPct: "",
  mobile1: "",
  mobile2: "",
  addr1: "",
  addr2: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  panNo: "",
  gstin: "",
  isActive: "true",
  remarks: "",
};

/** A pg NUMERIC as typed text: "2.50" → "2.5", blank stays blank. */
function numberText(value: unknown): string {
  const raw = text(value).trim();
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : "";
}

/** Qt `AgentEntry::fromRow`: the grid row (or `/get`, same snake keys) into the form. */
export function formValuesFromRow(row: AgentRow | null | undefined): Record<string, string> {
  const source = row ?? {};
  return {
    name: text(source.pag_name),
    code: text(source.pag_code),
    alias: text(source.pag_alias),
    defaultCommPct: numberText(source.pag_default_comm_pct),
    mobile1: text(source.pag_mobile1),
    mobile2: text(source.pag_mobile2),
    addr1: text(source.pag_addr1),
    addr2: text(source.pag_addr2),
    city: text(source.pag_city),
    district: text(source.pag_district),
    state: text(source.pag_state),
    pincode: text(source.pag_pincode),
    panNo: text(source.pag_pan_no),
    gstin: text(source.pag_gstin),
    // A record with no flag reads active, as the server defaults it.
    isActive: source.pag_is_active === undefined || isActive(source) ? "true" : "false",
    remarks: text(source.pag_remarks),
  };
}

export function validatePan(value: string | undefined): string | null {
  const pan = (value ?? "").trim().toUpperCase();
  if (!pan) return null;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? null : "PAN is 10 characters: 5 letters, 4 digits, a letter.";
}

export function validateGstin(value: string | undefined): string | null {
  const gstin = (value ?? "").trim().toUpperCase();
  if (!gstin) return null;
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin) ? null : "GSTIN is 15 characters, starting with the 2-digit state code.";
}

export function validateCommPct(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? null : "Commission % is between 0 and 100.";
}

/**
 * The save body (Qt `beforeSubmit`): the company, PAN / GSTIN trimmed and
 * upper-cased, blank text left out (the server stores NULL), a blank
 * commission sent as null. `editingId` makes it an update.
 */
export function buildSavePayload(
  values: Record<string, string | undefined>,
  opts: { companyId: string; editingId: string | null },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(opts.editingId ? { pagId: opts.editingId } : {}),
    companyId: opts.companyId,
    name: (values.name ?? "").replace(/\s+/g, " ").trim(),
  };
  for (const key of TEXT_KEYS) {
    let value = (values[key] ?? "").trim();
    if (key === "panNo" || key === "gstin") value = value.toUpperCase();
    if (value) body[key] = value;
  }
  const comm = (values.defaultCommPct ?? "").trim();
  const commNumber = Number(comm);
  body.defaultCommPct = comm && Number.isFinite(commNumber) ? commNumber : null;
  body.isActive = values.isActive !== "false";
  return body;
}

export type ToggleRequest = {
  route: "/purchase/agents/active";
  body: { pagId: string; active: boolean };
  title: string;
  message: string;
};

/** Qt `AgentList::toggleActive`: what Active on / off sends for the selected row, and what it asks first. */
export function toggleRequestOf(row: AgentRow): ToggleRequest {
  const active = !isActive(row);
  const name = text(row.pag_name);
  return {
    route: "/purchase/agents/active",
    body: { pagId: text(row.pag_id), active },
    title: active ? "Reactivate" : "Deactivate",
    message: active
      ? `Reactivate "${name}" and the agent's ledger?`
      : `Deactivate "${name}"? The agent's ledger is switched off too; documents that name the agent keep the name.`,
  };
}
