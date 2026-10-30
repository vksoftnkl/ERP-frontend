"use client";

/**
 * F12 — the batches / serials of ONE purchase line (Qt `PurchaseAllocDialog`,
 * NexERP 269da2d / e8789a6 / 85cab40 / 6e025ef; ui_table 63 "PURCHASE -
 * ALLOCATION ROWS"). Purchase Entry and GRN open it on a line; the rows come
 * back through `onAccept` as `allocs[]` entries (names kept, see
 * `allocDtoOf` for the wire row).
 *
 * One row per batch × bucket, or one per PIECE for an item that tracks serials.
 * OK stays off until Σ qty + free = received + damaged + free and nothing else
 * is wrong (rules: ../purchase-alloc.ts). A row can go to another godown of the
 * branch (dropdown GODOWNS, `ibranch_id`). Textile lines (stock.auto_batch_no +
 * batch-tracked item) carry Model · Size · Colour and leave Batch blank — Post
 * numbers it; Ratio pack · Ctrl+P makes the rows from a size ratio.
 *
 * Keys: Enter walks the cells the layout flags (`ui_tbl_clm_column_focus`),
 * Ctrl+Delete removes the row the cursor is on, Ctrl+P ratio pack, Esc cancels.
 *
 * `embedded` (Qt `PurchaseAllocDialog(…, embedded = true)`, how GRN, Shortage
 * Receipt and Purchase Entry open it): an INLINE panel under the screen's lines —
 * no window and no OK; each edit that leaves the rows adding up goes straight back
 * to the line (`onEdited`), Esc closes the panel, the Σ check sits under the rows,
 * and the screen's own keys (Ctrl+P is its Print) stay live around it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DateInput } from "@/components/design-system/ui";
import { cx } from "@/components/design-system/cx";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import { ChoicePickerCell } from "@/features/stocks/opening-stock/components/choice-picker-cell";
import { NewChoiceDialog } from "@/features/stocks/opening-stock/components/new-choice-dialog";
import { useQuickAddOpeningStockChoiceMutation } from "@/features/stocks/opening-stock/opening-stock.api";
import { useDropdownId, type ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import {
  ALLOC_COL,
  allocCellEditable,
  allocEntriesOf,
  allocHint,
  allocPanelHint,
  allocProblem,
  allocRowHas,
  allocSumText,
  applyRatioPack,
  editAllocRow,
  initialAllocRows,
  nameAllocRows,
  ratioOf,
  ratioPackSummary,
  resolveAllocColumns,
  withTrailingBlank,
  type AllocChoice,
  type AllocGridColumn,
  type AllocRow,
  type RatioPack,
} from "../purchase-alloc";
import { PICK_LIST_PAGE_SIZE, usePurchasePickListPageMutation } from "../purchase-dialogs.api";
import type { PurchaseAllocDialogProps, PurchaseAllocNeed } from "../purchase-dialogs.types";
import { qtyText } from "../purchase.format";
import { usePurchaseScope } from "../use-purchase-scope";
import { PurchaseSectionHeading } from "./purchase-parts";
import styles from "./purchase-dialogs.module.scss";

const GRID_NAME = "purchase-alloc-rows";
/** Pages of a pick-list walked at most (100 a page). */
const MAX_PAGES = 50;

type Lists = {
  godowns: AllocChoice[];
  sizes: AllocChoice[];
  colours: AllocChoice[];
};

/**
 * Every page of one configured dropdown as id + name (by the rows' SQL aliases).
 * A failed read is silent, as in Qt: the list stays empty — a godown cell then
 * offers only the document's godown, a size cell nothing to pick.
 */
function usePickList(key: ConfiguredDropdownKey, params: Record<string, string> | null, idKey: string, nameKey: string): AllocChoice[] {
  const dropdownId = useDropdownId(key);
  const [runPage] = usePurchasePickListPageMutation();
  const [list, setList] = useState<AllocChoice[]>([]);
  const paramsKey = params ? JSON.stringify(params) : "";
  useEffect(() => {
    if (!dropdownId || !paramsKey) {
      return;
    }
    let active = true;
    const load = async () => {
      const loaded: AllocChoice[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const rows = await runPage({
          dropdownId,
          page,
          params: JSON.parse(paramsKey) as Record<string, string>,
        }).unwrap();
        if (!active) {
          return;
        }
        for (const row of rows) {
          const id = String(row[idKey] ?? "").trim();
          const name = String(row[nameKey] ?? "").trim();
          if (id && name) {
            loaded.push({ id, name });
          }
        }
        if (rows.length < PICK_LIST_PAGE_SIZE) {
          break;
        }
      }
      setList(loaded);
    };
    load().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [dropdownId, idKey, nameKey, paramsKey, runPage]);
  return list;
}

export function PurchaseAllocDialog(props: PurchaseAllocDialogProps) {
  // Mounted only while open, so every opening starts from the line's own rows.
  return props.open ? <OpenAllocDialog {...props} /> : null;
}

/** The inline panel on the screen (`embedded`), if one is open: F12 again on its line goes into it. */
export const ALLOC_PANEL_ATTR = "data-purchase-alloc-panel";

/** Put the cursor in the open inline panel's first cell to type in (Qt `grid()->setFocus()`). */
export function focusAllocPanel(): boolean {
  const panel = document.querySelector<HTMLElement>(`[${ALLOC_PANEL_ATTR}]`);
  return panel ? focusFirstCell(panel) : false;
}

/** The first editable cell of the first row (Qt `focusFirstEditableCell(0)`), else any cell. */
function focusFirstCell(root: HTMLElement): boolean {
  const cell =
    root.querySelector<HTMLElement>(`[${GRID_FOCUS_STOP_ATTR}]:not(:disabled)`) ??
    root.querySelector<HTMLElement>(`[${GRID_FIELD_ATTR}]:not(:disabled)`);
  if (!cell) {
    return false;
  }
  cell.focus();
  return true;
}

function OpenAllocDialog({
  title,
  need: givenNeed,
  rows: given,
  readOnly,
  readOnlyReason,
  branchId,
  onAccept,
  onClose,
  embedded = false,
  onEdited,
  onProblem,
  tip,
}: PurchaseAllocDialogProps) {
  const { companyId } = usePurchaseScope();
  // The line's need can change while an inline panel is open (Qt setNeed): equal values keep one object.
  const needKey = JSON.stringify(givenNeed);
  const need = useMemo(() => JSON.parse(needKey) as PurchaseAllocNeed, [needKey]);
  // A counter of its own per opening (state, not a ref: the first rows are keyed while rendering).
  const [makeKey] = useState(() => {
    let seq = 0;
    return () => `alloc-${(seq += 1)}`;
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);
  // The first cell takes the focus when the body really mounts — a modal's body is
  // portaled a commit late, so a mount effect would find nothing to focus.
  const focusedOnce = useRef(false);
  const setBody = useCallback((element: HTMLDivElement | null) => {
    bodyRef.current = element;
    if (element && !focusedOnce.current) {
      focusedOnce.current = true;
      window.setTimeout(() => {
        if (element.isConnected) {
          focusFirstCell(element);
        }
      }, 0);
    }
  }, []);
  /** An edit by the operator since the panel opened — only then do rows go back to the line. */
  const touched = useRef(false);

  // ------------------------------------------------------------ the lists
  const godownParams = useMemo(() => (branchId ? { ibranch_id: branchId } : null), [branchId]);
  const choiceParams = useMemo(() => (need.textile && companyId ? { icompany_id: companyId } : null), [companyId, need.textile]);
  const godowns = usePickList("godown", godownParams, "gdl_id", "gdl_name");
  const loadedSizes = usePickList("itemSize", choiceParams, "isz_id", "isz_name");
  const loadedColours = usePickList("itemColour", choiceParams, "icl_id", "icl_name");
  // A size / colour added from here joins its list at once.
  const [added, setAdded] = useState<{
    sizes: AllocChoice[];
    colours: AllocChoice[];
  }>({ sizes: [], colours: [] });
  const lists: Lists = useMemo(
    () => ({
      godowns,
      sizes: [...loadedSizes, ...added.sizes.filter((one) => !loadedSizes.some((size) => size.id === one.id))],
      colours: [...loadedColours, ...added.colours.filter((one) => !loadedColours.some((colour) => colour.id === one.id))],
    }),
    [added, godowns, loadedColours, loadedSizes],
  );

  // ------------------------------------------------------------- the rows
  const [keyedRows, setRows] = useState<AllocRow[]>(() => {
    const start = initialAllocRows(need, given, makeKey);
    return readOnly ? start : withTrailingBlank(start, makeKey);
  });
  // Names a list brings in late (another godown, a size on a reopened line).
  const rows = useMemo(() => nameAllocRows(keyedRows, lists), [keyedRows, lists]);

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [ratioOpen, setRatioOpen] = useState(false);
  const [newChoice, setNewChoice] = useState<{
    rowKey: string;
    word: "size" | "colour";
  } | null>(null);
  const [quickAdd] = useQuickAddOpeningStockChoiceMutation();

  const layoutId = useUiTableId("purchaseAllocRows");
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId: layoutId }, { skip: !layoutId });
  const columns = useMemo(() => resolveAllocColumns(layout, need), [layout, need]);

  const problem = allocProblem(rows, need);
  const canAccept = !readOnly && problem === "";

  const edit = useCallback(
    (key: string, patch: Partial<Omit<AllocRow, "key">>) => {
      if (readOnly) {
        return;
      }
      setNotice("");
      touched.current = true;
      setRows((current) =>
        withTrailingBlank(
          current.map((row) => (row.key === key ? editAllocRow(row, patch, need) : row)),
          makeKey,
        ),
      );
    },
    [makeKey, need, readOnly],
  );

  const removeCurrent = useCallback(() => {
    if (readOnly || !currentKey) {
      return;
    }
    touched.current = true;
    setRows((current) => {
      const row = current.find((candidate) => candidate.key === currentKey);
      if (!row || !allocRowHas(row)) {
        return current;
      }
      return withTrailingBlank(
        current.filter((candidate) => candidate.key !== currentKey),
        makeKey,
      );
    });
  }, [currentKey, makeKey, readOnly]);

  const openRatioPack = useCallback(() => {
    if (!need.textile || readOnly) {
      return;
    }
    if (lists.sizes.length === 0) {
      setNotice("No sizes on the Size master yet.");
      return;
    }
    setRatioOpen(true);
  }, [lists.sizes.length, need.textile, readOnly]);

  const accept = useCallback(() => {
    if (readOnly) {
      onClose();
      return;
    }
    if (!canAccept) {
      return;
    }
    onAccept(allocEntriesOf(rows, need));
  }, [canAccept, need, onAccept, onClose, readOnly, rows]);

  // Embedded: an edit that adds up goes straight back to the line (Qt afterEdit → edited).
  const onEditedRef = useRef(onEdited);
  const onProblemRef = useRef(onProblem);
  useLayoutEffect(() => {
    onEditedRef.current = onEdited;
    onProblemRef.current = onProblem;
  });
  useEffect(() => {
    if (embedded && touched.current && !readOnly && problem === "") {
      onEditedRef.current?.(allocEntriesOf(rows, need));
    }
  }, [embedded, need, problem, readOnly, rows]);
  useEffect(() => {
    onProblemRef.current?.(problem);
  }, [problem]);

  // Ctrl+P (ratio pack) and Ctrl+Delete (remove the row) — only while this is
  // the topmost dialog. Ctrl+P is the browser's Print: always taken here.
  // Embedded: the panel's own onKeyDown (Ctrl+Delete; Ctrl+P stays the screen's Print).
  useEffect(() => {
    if (embedded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      const modals = document.querySelectorAll('[aria-modal="true"]');
      const top = modals[modals.length - 1];
      if (!top || !bodyRef.current || !top.contains(bodyRef.current)) {
        return;
      }
      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        event.stopPropagation();
        openRatioPack();
      } else if (event.key === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        removeCurrent();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [embedded, openRatioPack, removeCurrent]);

  /** Embedded: Esc closes the panel, Ctrl+Delete removes the row — keys from inside it only. */
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      return;
    }
    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      // a picker open in a cell takes its own Esc first (it marks it handled)
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Delete" && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      removeCurrent();
    }
  };

  /** Enter walks the flagged cells, row by row; off the last one it lands on OK. */
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLTableElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target?.hasAttribute(GRID_FIELD_ATTR)) {
      return;
    }
    event.preventDefault();
    if (!moveCellFocus(GRID_NAME, target, event.shiftKey ? -1 : 1) && !event.shiftKey && !embedded) {
      okRef.current?.focus();
    }
  };

  const submitNewChoice = async (name: string) => {
    const ask = newChoice;
    setNewChoice(null);
    if (!ask || !companyId) {
      return;
    }
    try {
      const row = await quickAdd({ kind: ask.word, name, companyId }).unwrap();
      const prefix = ask.word === "size" ? "isz" : "icl";
      const id = String(row[`${prefix}_id`] ?? "").trim();
      const shown = String(row[`${prefix}_name`] ?? "").trim() || name;
      if (!id) {
        return;
      }
      setAdded((current) =>
        ask.word === "size"
          ? { ...current, sizes: [...current.sizes, { id, name: shown }] }
          : { ...current, colours: [...current.colours, { id, name: shown }] },
      );
      edit(ask.rowKey, ask.word === "size" ? { sizeId: id, sizeName: shown } : { colourId: id, colourName: shown });
    } catch (error) {
      toast.apiError(error, {
        title: ask.word === "size" ? "Add a size" : "Add a colour",
      });
    }
  };

  const footer = (
    <div className={styles.actions}>
      {need.textile && !readOnly ? (
        <button type="button" className={cx(quotationStyles.button, styles.actionsLeft)} tabIndex={-1} onClick={openRatioPack}>
          Ratio pack · Ctrl+P
        </button>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          className={cx(quotationStyles.button, !need.textile && styles.actionsLeft)}
          tabIndex={-1}
          disabled={!currentKey || !rows.some((row) => row.key === currentKey && allocRowHas(row))}
          onClick={removeCurrent}
        >
          Remove row · Ctrl+Del
        </button>
      ) : (
        <span className={styles.readOnlyNote}>{readOnlyReason ?? "Read only."}</span>
      )}
      {!readOnly ? (
        <button
          ref={okRef}
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={!canAccept}
          title={problem || undefined}
          onClick={accept}
        >
          OK
        </button>
      ) : null}
      <button type="button" className={quotationStyles.button} onClick={onClose}>
        {readOnly ? "Close · Esc" : "Cancel · Esc"}
      </button>
    </div>
  );

  const grid = (
    <div className={cx(quotationStyles.gridViewport, embedded ? styles.inlineViewport : styles.viewport)}>
      <table className={cx(quotationStyles.grid, styles.table)} onKeyDown={onGridKeyDown}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.no} style={{ width: `${column.widthPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.no} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, columns.length)} className={styles.emptyCell}>
                No rows.
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className={cx(
                index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                row.bucket === "DAMAGED" && allocRowHas(row) && styles.damagedRow,
                row.key === currentKey && styles.selectedRow,
              )}
              onFocusCapture={() => setCurrentKey(row.key)}
            >
              {columns.map((column) => (
                <td key={column.no}>
                  <AllocCell
                    row={row}
                    column={column}
                    need={need}
                    readOnly={readOnly}
                    lists={lists}
                    onEdit={edit}
                    onAddNew={(word) => setNewChoice({ rowKey: row.key, word })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const sum = (
    <>
      {notice ? <p className={styles.problem}>{notice}</p> : null}
      {problem ? <p className={styles.problem}>{problem}</p> : <p className={styles.ok}>{allocSumText(need)} ✓</p>}
    </>
  );

  return (
    <>
      {embedded ? (
        <section
          className={styles.inlinePanel}
          aria-label={title}
          title={tip || undefined}
          onKeyDown={onPanelKeyDown}
          {...{ [ALLOC_PANEL_ATTR]: "" }}
        >
          <PurchaseSectionHeading
            title={title}
            hint={allocPanelHint(need)}
            actions={
              need.textile && !readOnly ? (
                <button type="button" className={quotationStyles.button} tabIndex={-1} onClick={openRatioPack}>
                  Ratio pack
                </button>
              ) : undefined
            }
          />
          <div ref={setBody} className={styles.inlineBody}>
            {grid}
            <div className={styles.inlineFoot}>
              {sum}
              <span className={styles.inlineKeys}>
                {readOnly ? (readOnlyReason ?? "Read only.") : "Ctrl+Del removes a row · Esc closes"}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <ModalShell title={title} isOpen fixedHeight panelClassName={styles.allocPanel} onClose={onClose} footer={footer}>
          <div ref={setBody} className={styles.body}>
            <p className={styles.hint}>{allocHint(need)}</p>
            {grid}
            {sum}
          </div>
        </ModalShell>
      )}
      {ratioOpen ? (
        <RatioPackDialog
          need={need}
          sizes={lists.sizes}
          colours={lists.colours}
          onCancel={() => setRatioOpen(false)}
          onMake={(pack) => {
            setRatioOpen(false);
            setNotice("");
            touched.current = true;
            setRows((current) => withTrailingBlank(applyRatioPack(current, pack, need, makeKey), makeKey));
          }}
        />
      ) : null}
      <NewChoiceDialog
        word={newChoice?.word ?? "size"}
        isOpen={newChoice !== null}
        onCancel={() => setNewChoice(null)}
        onAccept={(name) => void submitNewChoice(name)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// One cell
// ---------------------------------------------------------------------------

type AllocCellProps = {
  row: AllocRow;
  column: AllocGridColumn;
  need: PurchaseAllocNeed;
  readOnly: boolean;
  lists: Lists;
  onEdit: (key: string, patch: Partial<Omit<AllocRow, "key">>) => void;
  onAddNew: (word: "size" | "colour") => void;
};

const TEXT_FIELD: Partial<Record<number, "batchNo" | "serialNo" | "model">> = {
  [ALLOC_COL.batch]: "batchNo",
  [ALLOC_COL.serial]: "serialNo",
  [ALLOC_COL.model]: "model",
};
const NUMBER_FIELD: Partial<Record<number, "mrp" | "qty" | "free">> = {
  [ALLOC_COL.mrp]: "mrp",
  [ALLOC_COL.qty]: "qty",
  [ALLOC_COL.free]: "free",
};
const DATE_FIELD: Partial<Record<number, "mfgDate" | "expiryDate" | "warrantyTo">> = {
  [ALLOC_COL.mfg]: "mfgDate",
  [ALLOC_COL.expiry]: "expiryDate",
  [ALLOC_COL.warrantyTo]: "warrantyTo",
};
/**
 * Batch and model are codes, kept upper case as the line grids keep a batch;
 * a serial stays exactly as scanned. None of them is title-cased by the
 * app-wide capitalization.
 */
const UPPER_FIELD: Partial<Record<number, boolean>> = {
  [ALLOC_COL.batch]: true,
  [ALLOC_COL.model]: true,
};
const MAX_LENGTH: Partial<Record<number, number>> = {
  [ALLOC_COL.batch]: 60,
  [ALLOC_COL.serial]: 60,
  [ALLOC_COL.model]: 60,
};
/** Typed numbers: digits, one point. */
const NUMBER_PATTERN = /^\d*(\.\d{0,3})?$/;

function AllocCell({ row, column, need, readOnly, lists, onEdit, onAddNew }: AllocCellProps) {
  const editable = !readOnly && allocCellEditable(column.no, need);
  const field = String(column.no);
  const gridAttrs = {
    [GRID_GRID_ATTR]: GRID_NAME,
    [GRID_ROW_ATTR]: row.key,
    [GRID_FIELD_ATTR]: field,
    [GRID_COLUMN_INDEX_ATTR]: column.no,
    ...(column.focus ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };
  const label = column.header;

  if (column.no === ALLOC_COL.godown) {
    const known = lists.godowns.some((godown) => godown.id === row.godownId);
    return (
      <select
        className={styles.cellSelect}
        value={row.godownId}
        disabled={!editable || lists.godowns.length === 0}
        aria-label={label}
        title={row.godownName || undefined}
        onChange={(event) => {
          const id = event.target.value;
          onEdit(row.key, {
            godownId: id,
            godownName: lists.godowns.find((godown) => godown.id === id)?.name ?? "",
          });
        }}
        {...gridAttrs}
      >
        {!row.godownId ? <option value="">{allocRowHas(row) ? need.godownName : ""}</option> : null}
        {row.godownId && !known ? <option value={row.godownId}>{row.godownName || "…"}</option> : null}
        {lists.godowns.map((godown) => (
          <option key={godown.id} value={godown.id}>
            {godown.name}
          </option>
        ))}
      </select>
    );
  }

  if (column.no === ALLOC_COL.bucket) {
    return (
      <select
        className={styles.cellSelect}
        value={row.bucket}
        disabled={!editable}
        aria-label={label}
        onChange={(event) =>
          onEdit(row.key, {
            bucket: event.target.value === "DAMAGED" ? "DAMAGED" : "SALEABLE",
          })
        }
        {...gridAttrs}
      >
        <option value="SALEABLE">SALEABLE</option>
        <option value="DAMAGED">DAMAGED</option>
      </select>
    );
  }

  if (column.no === ALLOC_COL.size || column.no === ALLOC_COL.colour) {
    const isSize = column.no === ALLOC_COL.size;
    return (
      <ChoicePickerCell
        word={isSize ? "size" : "colour"}
        value={isSize ? row.sizeName : row.colourName}
        choices={isSize ? lists.sizes : lists.colours}
        editable={editable}
        gridName={GRID_NAME}
        rowKey={row.key}
        fieldKey={field}
        columnIndex={column.no}
        focusStop={column.focus}
        onPick={(choice) =>
          onEdit(row.key, isSize ? { sizeId: choice.id, sizeName: choice.name } : { colourId: choice.id, colourName: choice.name })
        }
        onAddNew={() => onAddNew(isSize ? "size" : "colour")}
      />
    );
  }

  const dateField = DATE_FIELD[column.no];
  if (dateField) {
    return (
      <DateInput
        className={quotationStyles.cellInput}
        wrapperClassName={styles.cellDate}
        value={row[dateField]}
        disabled={!editable}
        noPicker
        arrowStep={false}
        aria-label={label}
        onChange={(value) => onEdit(row.key, { [dateField]: value })}
        {...gridAttrs}
      />
    );
  }

  const numberField = NUMBER_FIELD[column.no];
  if (numberField) {
    return (
      <input
        className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
        type="text"
        inputMode="decimal"
        value={row[numberField]}
        disabled={!editable}
        aria-label={label}
        autoComplete="off"
        data-uppercase="off"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const value = event.target.value.trim();
          if (NUMBER_PATTERN.test(value)) {
            onEdit(row.key, { [numberField]: value });
          }
        }}
        {...gridAttrs}
      />
    );
  }

  const textField = TEXT_FIELD[column.no];
  if (textField) {
    return (
      <input
        className={quotationStyles.cellInput}
        type="text"
        value={row[textField]}
        disabled={!editable}
        maxLength={MAX_LENGTH[column.no]}
        aria-label={label}
        autoComplete="off"
        data-uppercase="off"
        onChange={(event) =>
          onEdit(row.key, {
            [textField]: UPPER_FIELD[column.no] ? event.target.value.toUpperCase() : event.target.value,
          })
        }
        {...gridAttrs}
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ratio pack · Ctrl+P
// ---------------------------------------------------------------------------

type RatioPackDialogProps = {
  need: PurchaseAllocNeed;
  sizes: readonly AllocChoice[];
  colours: readonly AllocChoice[];
  onCancel: () => void;
  onMake: (pack: RatioPack) => void;
};

/** Model + colours + a ratio per size × packs (1 : 2 : 2 : 1 × 3 = S 3 / M 6 / L 6 / XL 3, per colour). */
function RatioPackDialog({ need, sizes, colours, onCancel, onMake }: RatioPackDialogProps) {
  const [model, setModel] = useState("");
  const [packsText, setPacksText] = useState("1");
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  const packs = Math.min(9999, Math.max(0, Number.parseInt(packsText, 10) || 0));
  const pack: RatioPack = {
    model,
    colours: colours.filter((colour) => ticked.has(colour.id)),
    sizes: sizes.map((size) => ({ ...size, ratio: ratioOf(ratios[size.id] ?? "") })).filter((size) => size.ratio > 0),
    packs,
  };
  const summary = ratioPackSummary(pack);
  const canMake = summary.perPack > 0 && packs > 0;
  const make = () => {
    if (canMake) {
      onMake(pack);
    }
  };
  const onEnter = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      make();
    }
  };

  return (
    <ModalShell
      title="Ratio pack"
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={!canMake} onClick={make}>
            Make rows
          </button>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.ratioForm}>
          <label className={styles.ratioLabel} htmlFor="purchase-ratio-model">
            Model / design
          </label>
          <input
            id="purchase-ratio-model"
            className={quotationStyles.input}
            value={model}
            maxLength={60}
            autoFocus
            autoComplete="off"
            data-uppercase="off"
            onChange={(event) => setModel(event.target.value.toUpperCase())}
          />
          <span className={styles.ratioLabel}>Colours</span>
          <div className={styles.colourList} role="group" aria-label="Colours">
            {colours.length === 0 ? <span className={styles.hint}>No colours on the Colour master — one set without a colour.</span> : null}
            {colours.map((colour) => (
              <label key={colour.id} className={styles.colourItem}>
                <input
                  type="checkbox"
                  checked={ticked.has(colour.id)}
                  onChange={(event) => {
                    const next = new Set(ticked);
                    if (event.target.checked) {
                      next.add(colour.id);
                    } else {
                      next.delete(colour.id);
                    }
                    setTicked(next);
                  }}
                />
                {colour.name}
              </label>
            ))}
          </div>
          <label className={styles.ratioLabel} htmlFor="purchase-ratio-packs">
            Packs
          </label>
          <input
            id="purchase-ratio-packs"
            className={cx(quotationStyles.input, styles.packsInput)}
            type="text"
            inputMode="numeric"
            value={packsText}
            data-uppercase="off"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              if (/^\d{0,4}$/.test(event.target.value)) {
                setPacksText(event.target.value);
              }
            }}
            onKeyDown={onEnter}
          />
        </div>
        <div className={styles.sizesViewport}>
          <table className={cx(quotationStyles.grid, styles.table)}>
            <colgroup>
              <col style={{ width: "70%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((size, index) => (
                <tr key={size.id} className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}>
                  <td>
                    <div className={quotationStyles.cellText}>{size.name}</div>
                  </td>
                  <td>
                    <input
                      className={cx(quotationStyles.cellInput, styles.ratioInput)}
                      type="text"
                      inputMode="numeric"
                      value={ratios[size.id] ?? ""}
                      aria-label={`Ratio for ${size.name}`}
                      data-uppercase="off"
                      onChange={(event) => {
                        const value = event.target.value;
                        if (/^\d{0,4}$/.test(value)) {
                          setRatios((current) => ({
                            ...current,
                            [size.id]: value,
                          }));
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                          // Down the ratios; off the last one, make the rows.
                          const next = event.currentTarget.closest("tr")?.nextElementSibling?.querySelector("input");
                          event.preventDefault();
                          if (next instanceof HTMLInputElement) {
                            next.focus();
                            next.select();
                          } else {
                            make();
                          }
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.hint}>
          {summary.perPack === 0
            ? "Key a ratio against the sizes (e.g. 1 : 2 : 2 : 1)."
            : `${summary.perPack} per pack × ${packs} packs × ${summary.colours} colour(s) = ${summary.pieces} pcs · ${summary.rows} rows — the line received ${qtyText(need.received)}`}
        </p>
      </div>
    </ModalShell>
  );
}
