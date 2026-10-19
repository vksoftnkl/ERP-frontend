"use client";

/**
 * The LINES grid — ui_table 53 "TEXTILE TAGS - NEW TAG LINES".
 *
 * The painting rules of `TextileTagDelegate`: the price-source chip (auto
 * teal, typed amber), money to two places, the barcode blue once reserved and
 * a grey "on reserve" before, refused lines tinted, a reserved line read-only
 * and grey except its barcode, and the spare row at the bottom inviting the
 * next line. Item and Brand are popup cells (grids 71 / 91); size, colour,
 * fabric and season are TYPED, completed from the lists.
 *
 * Keys, as the Qt grid binds them: Enter commits and steps on along the
 * layout's focus stops; `+` / `-` add a line / remove the current one (on a
 * figure or picker cell — a text cell keeps them as characters, so Ctrl+`+` /
 * Ctrl+`-` work anywhere); typing on Item or Brand opens its popup with the
 * key; Ctrl+Enter reserves.
 */
import {
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { scaledWidth } from "@/features/sales/quotation/quotation.utils";
import { num, type TagLine, type TagLineField } from "../domain/textile-tag-entity";
import { hasItem, isReserved, isSpare, whyNotEditable } from "../domain/textile-tag-lines";
import { namesOf, type TagLists } from "../domain/textile-tag-lists";
import type { ResolvedTagColumn, TagColumnKind } from "../textile-tags.columns";
import { SPARE_ROW_PLACEHOLDER, TEXTILE_TAG_GRID_NAME } from "../textile-tags.constants";
import styles from "../page.module.scss";
import { TagCell, type TagCellKind } from "./tag-cell";

const ROW_ACTION_PX = 30;

/** The cells where a bare `+` / `-` is a line key rather than a character. */
const LINE_KEY_KINDS = new Set<TagColumnKind>([
  "lineNo",
  "itemLookup",
  "brandLookup",
  "money",
  "qty",
  "srcChip",
  "labels",
  "barcode",
]);

/** Money as the delegate paints it: whole rupees bare, else two places. */
export function moneyText(raw: string): string {
  if (raw.trim() === "") {
    return "";
  }
  const value = num(raw);
  return formatCurrency(value, Number.isInteger(value) ? 0 : 2, true);
}

export type TextileTagGridProps = {
  columns: ResolvedTagColumn[];
  lines: TagLine[];
  lists: TagLists;
  /** The open seasons' names, for the Season column's completer. */
  seasonNames: readonly string[];
  problemKeys: ReadonlySet<string>;
  activeKey: string | null;
  onActiveKeyChange: (key: string) => void;
  onTypeCell: (key: string, field: TagLineField, text: string) => void;
  onOpenItemPicker: (key: string, typed: string) => void;
  onOpenBrandPicker: (key: string, typed: string) => void;
  /** `+`: land on the spare row's Item cell. */
  onNewLine: () => void;
  onRemoveLine: (key: string) => void;
  /** An edit the row refuses — "Pick the item first." — for the hint line. */
  onRefuse: (why: string) => void;
  onCtrlEnter: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  resizingKey?: string | null;
  onColumnResizeStart?: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
};

function cellKindOf(kind: TagColumnKind): TagCellKind {
  switch (kind) {
    case "money":
      return "money";
    case "qty":
      return "qty";
    case "listName":
      return "listName";
    default:
      return "text";
  }
}

export function TextileTagGrid(props: TextileTagGridProps) {
  const {
    columns,
    lines,
    lists,
    seasonNames,
    problemKeys,
    activeKey,
    onActiveKeyChange,
    onTypeCell,
    onOpenItemPicker,
    onOpenBrandPicker,
    onNewLine,
    onRemoveLine,
    onRefuse,
    onCtrlEnter,
    onContextMenu,
    resizingKey = null,
    onColumnResizeStart,
  } = props;

  const listPrefix = useId();
  const listIds = useMemo(
    () => ({
      sizeName: `${listPrefix}-sizes`,
      colourName: `${listPrefix}-colours`,
      fabricName: `${listPrefix}-fabrics`,
      seasonName: `${listPrefix}-seasons`,
    }),
    [listPrefix],
  );
  const completions = useMemo(
    () => ({
      sizeName: namesOf(lists, "size"),
      colourName: namesOf(lists, "colour"),
      fabricName: namesOf(lists, "fabric"),
      seasonName: seasonNames.length > 0 ? [...seasonNames] : namesOf(lists, "season"),
    }),
    [lists, seasonNames],
  );

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const kindByKey = useMemo(() => new Map(visible.map((column) => [column.key, column.kind])), [visible]);
  const tableWidth = useMemo(
    () => visible.reduce((total, column) => total + column.widthPx, ROW_ACTION_PX),
    [visible],
  );
  /**
   * The key that is about to reach a picker cell. Enter on a picker that
   * already names something steps on; F2, a click or Enter on an empty one
   * opens the picker.
   */
  const lastKeyRef = useRef<string | null>(null);

  const openPicker = (kind: TagColumnKind, line: TagLine, typed: string) => {
    const viaEnter = lastKeyRef.current === "Enter";
    lastKeyRef.current = null;
    const filled = kind === "itemLookup" ? hasItem(line) : line.brandName.trim() !== "";
    if (viaEnter && filled && typed === "") {
      moveCellFocus(TEXTILE_TAG_GRID_NAME, document.activeElement, 1);
      return;
    }
    if (kind === "itemLookup") {
      onOpenItemPicker(line.key, typed);
    } else {
      onOpenBrandPicker(line.key, typed);
    }
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    const rowKey = target.getAttribute(GRID_ROW_ATTR);
    const field = target.getAttribute(GRID_FIELD_ATTR) ?? "";
    if (!rowKey) {
      return;
    }
    const kind = kindByKey.get(field as ResolvedTagColumn["key"]);
    const line = lines.find((candidate) => candidate.key === rowKey);

    const plus = event.key === "+" || (event.ctrlKey && event.key === "=");
    const minus = event.key === "-";
    if ((plus || minus) && !event.altKey && !event.metaKey) {
      const bare = !event.ctrlKey;
      if (!bare || (kind !== undefined && LINE_KEY_KINDS.has(kind))) {
        event.preventDefault();
        if (plus) {
          onNewLine();
        } else {
          onRemoveLine(rowKey);
        }
        return;
      }
    }

    // Typing on a picker cell opens its popup with that key, as the Qt grid's
    // popup takes the first keystroke.
    if (
      line &&
      (kind === "itemLookup" || kind === "brandLookup") &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.trim() !== ""
    ) {
      event.preventDefault();
      lastKeyRef.current = null;
      openPicker(kind, line, event.key);
      return;
    }

    if (event.key === "Enter") {
      // The cell has already committed its buffer; move on.
      event.preventDefault();
      moveCellFocus(TEXTILE_TAG_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
    }
  };

  return (
    <div className={quotationStyles.gridViewport} data-erp-table-viewport="true" onContextMenu={onContextMenu}>
      {(Object.keys(listIds) as (keyof typeof listIds)[]).map((field) => (
        <datalist key={field} id={listIds[field]}>
          {completions[field].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ))}
      <table className={cx(quotationStyles.grid, styles.tagGrid)} style={{ width: scaledWidth(tableWidth) }}>
        <colgroup>
          {visible.map((column) => (
            <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
          ))}
          <col style={{ width: scaledWidth(ROW_ACTION_PX) }} />
        </colgroup>
        <thead>
          <tr>
            {visible.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  quotationStyles.gridHeaderCell,
                  resizingKey === column.key && quotationStyles.gridHeaderCellResizing,
                )}
              >
                {column.header}
                {onColumnResizeStart ? (
                  <span
                    className={quotationStyles.columnResizeHandle}
                    role="presentation"
                    title="Drag to resize the column"
                    onMouseDown={(event) => onColumnResizeStart(event, column.key)}
                  />
                ) : null}
              </th>
            ))}
            <th scope="col" aria-label="Row actions" className={quotationStyles.gridHeaderActionCell} />
          </tr>
        </thead>
        <tbody
          onKeyDownCapture={(event) => {
            // Ctrl+Enter reserves from inside a cell (a window shortcut in Qt),
            // before the cell's own Enter commits-and-walks.
            if (event.ctrlKey && event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              lastKeyRef.current = null;
              (event.target as HTMLElement | null)?.blur?.();
              onCtrlEnter();
              return;
            }
            lastKeyRef.current = event.key;
          }}
          onMouseDownCapture={() => {
            lastKeyRef.current = null;
          }}
          onKeyDown={onGridKeyDown}
        >
          {lines.map((line, rowIndex) => {
            const reserved = isReserved(line);
            const itemed = hasItem(line);
            const spare = rowIndex === lines.length - 1 && isSpare(line);
            const problem = problemKeys.has(line.key);
            return (
              <tr
                key={line.key}
                className={cx(
                  rowIndex % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                  line.key === activeKey && quotationStyles.rowActive,
                  problem && styles.problemRow,
                  reserved && styles.reservedRow,
                )}
                onFocusCapture={() => onActiveKeyChange(line.key)}
                onMouseDown={() => onActiveKeyChange(line.key)}
              >
                {visible.map((column, columnIndex) => {
                  const field = column.key;
                  const why = field === "lineNo" ? "" : whyNotEditable(line, rowIndex, field);
                  const typedKinds: TagColumnKind[] = ["listName", "text", "money", "qty"];
                  const editable = why === "" && (typedKinds.includes(column.kind) || column.kind === "itemLookup" || column.kind === "brandLookup");
                  const refuse = (event: ReactMouseEvent<HTMLTableCellElement>) => {
                    // A disabled input lets the click through to the cell (see
                    // the skin), so the refusal can be said, never swallowed.
                    if (why && event.button === 0) {
                      onRefuse(why);
                    }
                  };
                  const dataAttrs = {
                    [GRID_GRID_ATTR]: TEXTILE_TAG_GRID_NAME,
                    [GRID_ROW_ATTR]: line.key,
                    [GRID_FIELD_ATTR]: field,
                    [GRID_COLUMN_INDEX_ATTR]: columnIndex,
                    ...(column.focus ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
                  };
                  const alignClass =
                    column.align === "right"
                      ? quotationStyles.alignRight
                      : column.align === "center"
                        ? quotationStyles.alignCenter
                        : undefined;

                  let content: ReactNode;
                  switch (column.kind) {
                    case "lineNo":
                      content = <span className={cx(quotationStyles.cellText, alignClass)}>{rowIndex + 1}</span>;
                      break;

                    case "itemLookup":
                    case "brandLookup": {
                      const label = column.kind === "itemLookup" ? line.itemName : line.brandName;
                      content = (
                        <input
                          className={cx(
                            quotationStyles.cellInput,
                            alignClass,
                            !editable && styles.cellDisabled,
                            spare && column.kind === "itemLookup" && styles.cellMuted,
                          )}
                          value={label}
                          readOnly
                          disabled={!editable}
                          placeholder={
                            column.kind === "itemLookup" && spare ? SPARE_ROW_PLACEHOLDER : undefined
                          }
                          title={label || undefined}
                          {...(column.kind === "itemLookup" ? { [GRID_LOOKUP_ATTR]: "true" } : {})}
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={() => {
                            if (editable) {
                              lastKeyRef.current = null;
                              openPicker(column.kind, line, "");
                            }
                          }}
                          onKeyDown={(event) => {
                            if (editable && (event.key === "Enter" || event.key === "F2")) {
                              event.preventDefault();
                              event.stopPropagation();
                              openPicker(column.kind, line, "");
                            }
                          }}
                          {...dataAttrs}
                        />
                      );
                      break;
                    }

                    case "srcChip": {
                      const src = line.priceSrc;
                      content = src ? (
                        <span className={cx(quotationStyles.cellText, quotationStyles.alignCenter)}>
                          <span
                            className={cx(styles.chip, src === "auto" ? styles.chipAuto : styles.chipTyped)}
                            title={line.rule || undefined}
                          >
                            {src}
                          </span>
                        </span>
                      ) : (
                        <span className={quotationStyles.cellText} />
                      );
                      break;
                    }

                    case "labels":
                      content = (
                        <span className={cx(quotationStyles.cellText, alignClass)}>{itemed ? line.labels : ""}</span>
                      );
                      break;

                    case "barcode": {
                      const tagCount = line.tagIds ? line.tagIds.split(",").filter(Boolean).length : 0;
                      content = reserved ? (
                        <span
                          className={cx(quotationStyles.cellText, alignClass, styles.barcodeReserved)}
                          title={tagCount > 1 ? `${tagCount} tag(s), one label each` : "one tag for the line"}
                        >
                          {line.barcode}
                        </span>
                      ) : (
                        <span className={cx(quotationStyles.cellText, alignClass, styles.cellMuted)}>
                          {itemed && line.barcode.trim() === "" ? "on reserve" : line.barcode}
                        </span>
                      );
                      break;
                    }

                    case "hidden":
                      content = (
                        <span className={cx(quotationStyles.cellText, alignClass)} title={line[field as TagLineField] || undefined}>
                          {line[field as TagLineField]}
                        </span>
                      );
                      break;

                    default: {
                      const raw = line[field as TagLineField];
                      const money = column.kind === "money";
                      const display = money
                        ? raw.trim() === "" && itemed && field === "mrp"
                          ? "—"
                          : moneyText(raw)
                        : undefined;
                      const listId =
                        column.kind === "listName" ? listIds[field as keyof typeof listIds] : undefined;
                      content = (
                        <TagCell
                          kind={cellKindOf(column.kind)}
                          value={raw}
                          display={display}
                          align={column.align}
                          editable={editable}
                          bold={field === "price"}
                          maxLength={column.maxLength}
                          listId={listId}
                          keepCase={field === "sizeName" || field === "supplierArticle"}
                          title={field === "price" && line.rule ? line.rule : undefined}
                          gridName={TEXTILE_TAG_GRID_NAME}
                          rowKey={line.key}
                          fieldKey={field}
                          columnIndex={columnIndex}
                          focusStop={column.focus}
                          onCommit={(text) => onTypeCell(line.key, field as TagLineField, text)}
                        />
                      );
                    }
                  }

                  return (
                    <td key={column.key} onMouseDown={refuse}>
                      {content}
                    </td>
                  );
                })}
                <td className={quotationStyles.actionCell}>
                  <button
                    type="button"
                    className={quotationStyles.rowButton}
                    disabled={!itemed}
                    title={reserved ? "A reserved line keeps its barcodes. Void a tag from the Register." : "Remove this line (-)"}
                    aria-label={`Remove ${line.itemName || "line"}`}
                    onClick={() => onRemoveLine(line.key)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
