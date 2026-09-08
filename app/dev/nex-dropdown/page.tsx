"use client";
/**
 * A bench for the configured-dropdown components, against the live dropdowns.
 *
 * Not linked from any menu — it exists so the components can be exercised on
 * their own, with real ids, before they replace the hand-rolled comboboxes on the
 * master and sales screens.
 *
 * Safe to delete once the migration is done.
 */
import { useState } from "react";
import { NexDropdownMulti, NexDropdownSingle } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import { registerDropdownMaster } from "@/components/design-system/dropdown/masters";

const SAMPLES: Array<{ id: string; label: string }> = [
  { id: "39", label: "Customers (39)" },
  { id: "8", label: "Company (8) — no dropdown_completion, 1-based columns" },
  { id: "21", label: "GST state codes (21)" },
  { id: "36", label: "Taxes (36)" },
  { id: "42", label: "Items (42) — pages past the first 25" },
  { id: "38", label: "Employees (38) — needs iemp_branch_id" },
];

/**
 * Two registrations, to exercise both sides of the permission gate: menu 10
 * (Customers) is one the signed-in user holds, menu 249 exists in no menu at all,
 * so Alt+C there must refuse out loud rather than open.
 */
registerDropdownMaster(39, {
  menuId: 10,
  render: ({ mode, query, selectionId, onSaved, onClose }) => (
    <div data-testid="master-entry" style={entryStyle}>
      <strong>
        {mode === "create" ? "Add customer" : "Amend customer"} {selectionId ?? ""}
      </strong>
      <span>prefilled from the field: “{query}”</span>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button
          type="button"
          data-testid="master-save"
          onClick={() => onSaved({ id: "test-customer-id", text: query || "NEW CUSTOMER" })}
        >
          Save
        </button>
        <button type="button" data-testid="master-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  ),
});

registerDropdownMaster(36, {
  menuId: 249,
  render: () => <div data-testid="tax-master-entry">tax master (should never open here)</div>,
});

const entryStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  zIndex: 60,
  display: "grid",
  gap: "0.4rem",
  padding: "0.6rem",
  border: "1px solid #c9d5e3",
  borderRadius: 6,
  background: "#fff",
  boxShadow: "0 18px 32px rgba(15, 23, 42, 0.16)",
  fontSize: "0.78rem",
  minWidth: "18rem",
};

export default function NexDropdownBenchPage() {
  const [branchId, setBranchId] = useState("");
  const [values, setValues] = useState<Record<string, DropdownSelection | null>>({});
  const [states, setStates] = useState<DropdownSelection[]>([]);

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1.25rem", maxWidth: "760px" }}>
      <h1 style={{ fontSize: "1.05rem", margin: 0 }}>NexDropdown bench</h1>
      <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.8rem" }}>
        <span>Branch id bound into dropdown 38 (iemp_branch_id)</span>
        <input
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          placeholder="paste a br_id uuid"
          style={{ padding: "0.4rem", border: "1px solid #c9d5e3", borderRadius: 5 }}
        />
      </label>
      {SAMPLES.map((sample) => (
        <div key={sample.id} style={{ display: "grid", gap: "0.3rem", fontSize: "0.8rem" }}>
          <span>{sample.label}</span>
          <NexDropdownSingle
            dropdownId={sample.id}
            value={values[sample.id] ?? null}
            onChange={(selection) =>
              setValues((current) => ({ ...current, [sample.id]: selection }))
            }
            params={sample.id === "38" ? { iemp_branch_id: branchId } : undefined}
            placeholder="Type to search…"
            aria-label={sample.label}
          />
          <output data-testid={`value-${sample.id}`} style={{ color: "#5a7084" }}>
            {values[sample.id]
              ? `${values[sample.id]?.text} [${values[sample.id]?.id}]`
              : "(nothing selected)"}
          </output>
        </div>
      ))}
      <div style={{ display: "grid", gap: "0.3rem", fontSize: "0.8rem" }}>
        <span>Multi — GST state codes (21)</span>
        <NexDropdownMulti
          dropdownId="21"
          value={states}
          onChange={setStates}
          placeholder="Type to search…"
          aria-label="Multi states"
        />
        <output data-testid="value-multi" style={{ color: "#5a7084" }}>
          {states.length ? states.map((state) => state.text).join(" > ") : "(nothing selected)"}
        </output>
      </div>
    </div>
  );
}
