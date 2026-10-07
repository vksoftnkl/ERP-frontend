"use client";

/**
 * The field-map rows of one endpoint, inside the endpoint popup (Qt
 * `GstFieldMapPanel`). They arrive with the endpoint (`/get` → `fieldMaps[]`);
 * each is edited in its own popup and saved on its own route, so the panel
 * adds nothing to the endpoint's save. A new endpoint has no id yet: save it
 * first. + adds, − deletes, Enter edits.
 */
import { useCallback, useState } from "react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useDeleteGstPartMutation } from "@/store/api/gstConfigApi";
import { GstTable } from "../components/gst-table";
import { PartDialog } from "../components/part-dialog";
import { FIELD_MAP_FORM } from "../domain/forms";
import { gstErrorText } from "../domain/format";
import { FIELD_MAP_COLUMNS } from "./columns";
import styles from "../gst.module.scss";

type JsonRecord = Record<string, unknown>;

export type FieldMapPanelProps = {
  gpeId: string | null;
  rows: readonly JsonRecord[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** A field-map row changed: re-read the endpoint. */
  onChanged: () => void;
};

const rowKey = (row: JsonRecord) => String(row.gfmId ?? "");

export function FieldMapPanel({ gpeId, rows, canCreate, canEdit, canDelete, onChanged }: FieldMapPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: JsonRecord | null } | null>(null);
  const [deletePart] = useDeleteGstPartMutation();
  const effectiveSelected = rows.some((row) => rowKey(row) === selected) ? selected : (rows[0] ? rowKey(rows[0]) : null);
  const selectedRow = rows.find((row) => rowKey(row) === effectiveSelected) ?? null;

  const add = useCallback(() => {
    if (gpeId && canCreate) {
      setEditing({ row: null });
    }
  }, [canCreate, gpeId]);

  const edit = useCallback((row: JsonRecord | null) => {
    if (gpeId && row) {
      setEditing({ row });
    }
  }, [gpeId]);

  const remove = useCallback(
    async (row: JsonRecord | null) => {
      if (!gpeId || !row || !canDelete) {
        return;
      }
      const ok = await confirm({
        title: "Confirm Delete",
        message: `Delete the field map ${String(row.gfmOurField ?? "")}?`,
        confirmLabel: "Delete",
      });
      if (!ok) {
        return;
      }
      try {
        await deletePart({ url: FIELD_MAP_FORM.deleteUrl, body: { gfmId: row.gfmId } }).unwrap();
        onChanged();
      } catch (error) {
        toast.error(gstErrorText(error, "The field map could not be deleted."));
      }
    },
    [canDelete, deletePart, gpeId, onChanged],
  );

  return (
    <div className={styles.column}>
      <GstTable
        columns={FIELD_MAP_COLUMNS}
        rows={rows}
        rowKey={rowKey}
        selectedKey={effectiveSelected}
        onSelect={setSelected}
        onActivate={edit}
        onAdd={gpeId && canCreate ? add : undefined}
        onDelete={gpeId && canDelete ? (row) => void remove(row) : undefined}
        emptyText={gpeId ? "No field map yet." : "—"}
        ariaLabel="Field map"
      />
      <div className={styles.listBar}>
        <span className={styles.hint}>
          {gpeId
            ? "+ add  ·  − delete  ·  Enter edits  ·  each row saves on its own"
            : "Save the endpoint first; its field map is added after."}
        </span>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSmall}`}
          disabled={!gpeId || !canCreate}
          onClick={add}
        >
          + Add
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSmall}`}
          disabled={!gpeId || !selectedRow}
          onClick={() => edit(selectedRow)}
        >
          {canEdit ? "Edit" : "View"}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSmall}`}
          disabled={!gpeId || !selectedRow || !canDelete}
          onClick={() => void remove(selectedRow)}
        >
          − Delete
        </button>
      </div>
      {editing && gpeId ? (
        <PartDialog
          spec={FIELD_MAP_FORM}
          parentId={gpeId}
          row={editing.row}
          readOnly={editing.row ? !canEdit : false}
          onClose={() => setEditing(null)}
          onSaved={(data) => {
            if (data.gfmId) {
              setSelected(String(data.gfmId));
            }
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
