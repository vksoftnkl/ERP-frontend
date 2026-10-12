import type { EntryMode, GridRow, TillForms, TillMasterKind } from "../domain/till-masters";

/** What every popup body gets from the dialog that hosts it. */
export type EntryFieldsProps<K extends TillMasterKind> = {
  form: TillForms[K];
  update: (patch: Partial<TillForms[K]>) => void;
  mode: EntryMode;
  /** The grid row the popup opened on; null for a new record. */
  row: GridRow | null;
  /** False on a read-only popup (a replaced shipped row, no right, a save in flight). */
  editable: boolean;
  /** Fields held still for this row (`lockedFields`). */
  locked: readonly string[];
  /** The field that takes the caret on open (`firstField`). */
  focus: string | null;
  companyId: string;
  branchId: string;
};
