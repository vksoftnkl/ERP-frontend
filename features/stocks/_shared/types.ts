export type ColumnAlign = "left" | "center" | "right";
export type ColumnKind = "text" | "number" | "date" | "select" | "lookup";
export type LookupKind = "item" | "godown" | "batch" | "reason";
export type LookupCellState = {
  key: string;
  kind: LookupKind;
};
