"use client";
import { useCallback, useMemo } from "react";
import type { WidgetFieldDraft } from "./type";
export function parseFieldDrafts(value: string | undefined): WidgetFieldDraft[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => normalizeDraft(entry));
  } catch {
    return [];
  }
}
export function serializeFieldDrafts(drafts: WidgetFieldDraft[]): string {
  return JSON.stringify(drafts);
}
function normalizeDraft(entry: unknown): WidgetFieldDraft {
  const source = (entry ?? {}) as Record<string, unknown>;
  const rawId = source.fieldId;
  const fieldId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && rawId.trim() !== "" && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : undefined;
  return {
    ...(fieldId !== undefined ? { fieldId } : {}),
    fieldName: toText(source.fieldName),
    fieldGuiName: toText(source.fieldGuiName),
    fieldSecondaryText: toText(source.fieldSecondaryText),
    fieldPosition: toText(source.fieldPosition),
    fieldVisibility: source.fieldVisibility !== false,
  };
}
function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
function emptyDraft(position: number): WidgetFieldDraft {
  return {
    fieldName: "",
    fieldGuiName: "",
    fieldSecondaryText: "",
    fieldPosition: String(position),
    fieldVisibility: true,
  };
}
type FieldsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};
const cellStyle: React.CSSProperties = {
  padding: "4px 6px",
  border: "1px solid var(--border-subtle, #d0d5dd)",
  fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  fontSize: 12,
};
const invalidInputStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "#d92d20",
  outlineColor: "#d92d20",
};

/** A row counts as started once any of its text columns has content. */
function isDraftStarted(draft: WidgetFieldDraft): boolean {
  return [draft.fieldName, draft.fieldGuiName, draft.fieldSecondaryText].some(
    (column) => (column ?? "").trim().length > 0,
  );
}
export default function FieldsEditor({ value, onChange, disabled = false }: FieldsEditorProps) {
  const drafts = useMemo(() => parseFieldDrafts(value), [value]);
  const commit = useCallback(
    (next: WidgetFieldDraft[]) => onChange(serializeFieldDrafts(next)),
    [onChange],
  );
  const updateDraft = useCallback(
    (index: number, patch: Partial<WidgetFieldDraft>) => {
      commit(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
    },
    [commit, drafts],
  );
  const addDraft = useCallback(() => {
    commit([...drafts, emptyDraft(drafts.length)]);
  }, [commit, drafts]);
  const removeDraft = useCallback(
    (index: number) => {
      commit(drafts.filter((_, i) => i !== index));
    },
    [commit, drafts],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle}>
              Field Name <span style={{ color: "#d92d20" }}>*</span>
            </th>
            <th style={cellStyle}>GUI Name</th>
            <th style={cellStyle}>Secondary Text</th>
            <th style={{ ...cellStyle, width: 80 }}>Position</th>
            <th style={{ ...cellStyle, width: 70 }}>Visible</th>
            <th style={{ ...cellStyle, width: 40 }} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {drafts.length === 0 ? (
            <tr>
              <td style={{ ...cellStyle, textAlign: "center", color: "#667085" }} colSpan={6}>
                No fields yet.
              </td>
            </tr>
          ) : (
            drafts.map((draft, index) => (
              <tr key={draft.fieldId ?? `new-${index}`}>
                <td style={cellStyle}>
                  <input
                    style={
                      draft.fieldName.trim().length === 0 && isDraftStarted(draft)
                        ? invalidInputStyle
                        : inputStyle
                    }
                    value={draft.fieldName}
                    disabled={disabled}
                    onChange={(event) => updateDraft(index, { fieldName: event.target.value })}
                    placeholder="item_name (required)"
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    style={inputStyle}
                    value={draft.fieldGuiName}
                    disabled={disabled}
                    onChange={(event) => updateDraft(index, { fieldGuiName: event.target.value })}
                    placeholder="English Name"
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    style={inputStyle}
                    value={draft.fieldSecondaryText}
                    disabled={disabled}
                    onChange={(event) =>
                      updateDraft(index, { fieldSecondaryText: event.target.value })
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    step={1}
                    value={draft.fieldPosition}
                    disabled={disabled}
                    onChange={(event) => updateDraft(index, { fieldPosition: event.target.value })}
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={draft.fieldVisibility}
                    disabled={disabled}
                    onChange={(event) =>
                      updateDraft(index, { fieldVisibility: event.target.checked })
                    }
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => removeDraft(index)}
                    disabled={disabled}
                    aria-label="Remove field"
                    style={{ cursor: "pointer", border: "none", background: "transparent" }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div>
        <button
          type="button"
          onClick={addDraft}
          disabled={disabled}
          style={{ cursor: "pointer", padding: "4px 10px", fontSize: 12 }}
        >
          + Add Field
        </button>
      </div>
    </div>
  );
}