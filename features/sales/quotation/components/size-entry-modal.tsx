"use client";

/**
 * Size Entry — one item keyed in several sizes in one pass.
 *
 * Shared by Quotation Entry and Sale Bill: generic over the line type, because
 * `SaleBillDraftLine` is the quotation's `DraftLine` plus the bill's columns and
 * this dialog reads only what both have. The screen supplies its own line copier
 * so a new size row sheds the right identity — see `applySizeEntry`.
 *
 * Opened by double-click or F3 on an item row (F4 is the unit switcher). The
 * rows here are **local state until Save**: the draft is not touched while the
 * dialog is open, so Cancel is genuinely free and the operator cannot leave the
 * items grid half-rewritten by closing the dialog. Save hands the rows to
 * `applySizeEntry`, which is where every rule about what a replaced row keeps
 * lives — this file only collects the keystrokes.
 *
 * It is keyed the way sizes are written on paper: an L × W line with a rate,
 * then the T – Pcs lines cut from it, each with its own rate, then the next
 * L × W (see `SizeSheetRow`). Only the T – Pcs lines are sizes; each is saved as
 * the full `L*W*T*Pcs` (length ft × width in × thickness in × pieces) — the
 * `sqi_size` free text the grid's Size cell holds, since no size master exists.
 * Qty follows the CFT that works out to, exactly as the grid's Size cell feeds
 * Bill Qty. Rate is keyed on the L × W line only and every T – Pcs under it is
 * sold at it; a size at another rate goes under a second L × W line.
 *
 * Keyboard: Enter walks L → W → Rate → T → Pcs → the next T. Enter on an
 * L × W's last Pcs opens another T – Pcs under it; Enter on that new line's
 * empty T moves on to the next L × W — or, at the end of the sheet, turns the
 * line into a new one — and Enter on an empty L there means done: it hands the
 * cursor to OK. `+` adds an L × W and Alt+T a T – Pcs
 * under the L × W the cursor is in. Ctrl+Enter saves from anywhere.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, formatQty } from "@/domain/pricing";
import {
  createSizeCut,
  createSizeFace,
  findSizeGroup,
  openSizeSheet,
  patchSizeCut,
  patchSizeFace,
  removeSizeSheetRow,
  sizeCutFactors,
  sizeEntryTotals,
  sizeFaceEndOf,
  sizeFaceIndexOf,
  sizeSheetEntries,
  validateSizeSheet,
  type SizeEntryRow,
  type SizeFaceRow,
  type SizeGroupLine,
  type SizeSheetRow,
} from "../quotation.sizes";
import {
  SIZE_FACTOR_COUNT,
  SIZE_FACTOR_LABELS,
  SIZE_FACTOR_PLACEHOLDERS,
  SIZE_FACTOR_SEPARATORS,
  SIZE_UOM,
  cubicFeetFromSize,
  joinSizeFactors,
  sanitizeSizeFactorInput,
  sanitizeSizeInput,
} from "../quotation.utils";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

export type SizeEntryModalProps<T extends SizeGroupLine> = {
  /** The row the dialog was opened on. */
  anchorKey: string;
  /** The draft's lines, read ONCE at mount — see `useState` below. */
  lines: T[];
  onClose: () => void;
  onSave: (anchorKey: string, rows: SizeEntryRow<T>[]) => void;
};

/**
 * Two of the four dimension boxes — L × W on an L × W line, T – Pcs on the lines
 * under it. `first` is the factor index of the left box (0 or 2), which picks
 * the labels, placeholders and separator the grid's Size cell uses for them.
 *
 * Deliberately a local component rather than a reach into `GridCell`: that one
 * keeps an uncommitted buffer and writes to the draft on blur, because a grid
 * cell must not dispatch per keystroke. Here the rows ARE local state, so every
 * keystroke can land straight on them and the buffer would be a second copy of
 * the same value waiting to go stale.
 */
function SizePair(props: {
  first: 0 | 2;
  values: [string, string];
  /** Stamped on the wrapper so the dialog can put the cursor in THIS row. */
  rowKey: string;
  invalid?: boolean;
  autoFocus?: boolean;
  onChange: (values: [string, string]) => void;
  onEnter: (input: HTMLInputElement, factor: number, shiftKey: boolean) => void;
}) {
  const { first, values, rowKey, invalid, autoFocus, onChange, onEnter } = props;
  return (
    <span className={styles.cellSizeBoxes} data-size-row={rowKey}>
      {values.map((value, offset) => {
        const factor = first + offset;
        return (
          <Fragment key={SIZE_FACTOR_LABELS[factor]}>
            {offset > 0 && (
              <span aria-hidden className={styles.cellSizeSep}>
                {SIZE_FACTOR_SEPARATORS[factor]}
              </span>
            )}
            <input
              className={cx(styles.cellInput, styles.cellSizeBox, invalid && styles.cellInvalid)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={autoFocus && offset === 0}
              title={SIZE_FACTOR_LABELS[factor]}
              aria-label={SIZE_FACTOR_LABELS[factor]}
              placeholder={SIZE_FACTOR_PLACEHOLDERS[factor]}
              value={value}
              onChange={(event) => {
                const next: [string, string] = [...values];
                // Only the last box tolerates a `*`: nothing keyed through the
                // boxes produces one, but a size saved as free text before the
                // boxes existed keeps its extra factors there, and stripping them
                // on the first keystroke would rewrite the operator's value.
                next[offset] =
                  factor === SIZE_FACTOR_COUNT - 1
                    ? sanitizeSizeInput(event.target.value)
                    : sanitizeSizeFactorInput(event.target.value);
                onChange(next);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.ctrlKey || event.metaKey) {
                  return;
                }
                event.preventDefault();
                onEnter(event.currentTarget, factor, event.shiftKey);
              }}
            />
          </Fragment>
        );
      })}
    </span>
  );
}

/** Put the cursor in a row's first box (L or T), its value selected. */
function focusRowStart(root: HTMLElement | null, rowKey: string): void {
  const box = root?.querySelector<HTMLInputElement>(
    `[data-size-row="${rowKey}"] input:not([disabled])`,
  );
  box?.focus();
  box?.select();
}

export function SizeEntryModal<T extends SizeGroupLine>(props: SizeEntryModalProps<T>) {
  const { anchorKey, lines, onClose, onSave } = props;

  /**
   * The group and the rows are captured ONCE, in the `useState` initialisers.
   *
   * The dialog is mounted only while it is open, so mount is the open — and
   * re-reading `lines` afterwards would be a live wire: any dispatch that
   * replaces the lines array (a revalidation, a stray commit landing from a cell
   * that had focus) would re-seed the dialog and throw away everything the
   * operator has keyed into it. Nothing outside can change this item's sizes
   * while the dialog owns them, so a snapshot is the honest model.
   */
  const [group] = useState(() => findSizeGroup(lines, anchorKey));
  const [rows, setRows] = useState<SizeSheetRow<T>[]>(() => (group ? openSizeSheet(group) : []));
  /**
   * Errors stay hidden until Save is pressed. A dialog that opens with "Size is
   * required" under a blank row it just added is telling the operator off for
   * not having typed yet; blocking the save and pointing at the cell then is the
   * same information at the moment it is actually useful.
   */
  const [showErrors, setShowErrors] = useState(false);
  /** The dialog body — the scope the Enter walker reads its boxes from. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** Where Enter hands the cursor once the operator is done — see `onRateEnter`. */
  const okButtonRef = useRef<HTMLButtonElement | null>(null);

  const template = group?.lines[0] ?? null;
  const baseRate = template?.rate ?? 0;

  // Everything OK acts on — the count, the total, the save — reads the sizes the
  // sheet adds up to: keyed T – Pcs lines with their L × W folded in.
  const entries: SizeEntryRow<T>[] = useMemo(() => sizeSheetEntries(rows), [rows]);
  const validation = useMemo(() => validateSizeSheet(rows), [rows]);
  const totals = useMemo(() => sizeEntryTotals(entries), [entries]);

  /**
   * Move focus one keyable box along, in DOM order.
   *
   * Read off the live DOM rather than tracked per row: the boxes ARE the tab
   * order here, so asking the document is both shorter and automatically right
   * as rows are added and removed. Stops at either end instead of wrapping —
   * Enter past the last box should settle, not jump back to the top.
   */
  const focusAdjacentField = (from: HTMLElement, delta: 1 | -1): void => {
    const root = bodyRef.current;
    if (!root) {
      return;
    }
    const fields = Array.from(root.querySelectorAll<HTMLInputElement>("input:not([disabled])"));
    const next = fields[fields.indexOf(from as HTMLInputElement) + delta];
    if (next) {
      next.focus();
      next.select();
    }
  };

  /**
   * The row whose first box the cursor owes a visit, once React has rendered
   * it. "+ L × W" is a BUTTON: clicking it takes focus off whatever box
   * was being keyed and parks it on the button, where the next keystroke types
   * nothing. So adding a row names it here and the effect below moves the cursor
   * into it — a click and an Enter both end where the operator is about to type.
   */
  const pendingFocusRef = useRef<string | null>(null);

  /**
   * Add an L × W or a T – Pcs and put the cursor in it.
   *
   * `fromIndex` is the row the cursor was on: the new row goes at the end of
   * THAT L × W's lines, so Alt+T in the middle of the sheet adds a size to the
   * face being keyed rather than to the last one. `null` (the button, which
   * takes focus off the rows when clicked) appends at the end of the sheet.
   *
   * The empty T – Pcs Enter opened is reused rather than stacked under: Alt+T
   * on it just keeps the cursor there, and `+` takes its place — the same as
   * Enter on its empty T. A sheet always opens on an L × W, so a T – Pcs asked
   * for on an empty sheet brings one with it.
   */
  const addRow = useCallback(
    (kind: "face" | "cut", fromIndex: number | null): void => {
      const at =
        fromIndex === null || fromIndex < 0
          ? rows.length
          : sizeFaceEndOf(rows, sizeFaceIndexOf(rows, fromIndex));
      const before = rows[at - 1];
      const spare = before?.kind === "cut" && before.pristine && !before.source ? before : null;
      if (spare && kind === "cut") {
        focusRowStart(bodyRef.current, spare.key);
        return;
      }
      // Built outside the updater: the keys have to be known HERE, and an
      // updater React may run twice must not mint two rows.
      const added: SizeSheetRow<T>[] =
        kind === "cut" && rows.length > 0 ? [createSizeCut<T>()] : [createSizeFace(baseRate)];
      if (kind === "cut" && rows.length === 0) {
        added.push(createSizeCut<T>());
      }
      const from = spare ? at - 1 : at;
      pendingFocusRef.current = added[0].key;
      setRows((current) => [...current.slice(0, from), ...added, ...current.slice(at)]);
    },
    [baseRate, rows],
  );

  /** The sheet row holding focus, or -1 when the cursor is not in one. */
  const focusedRowIndex = useCallback((): number => {
    const key = document.activeElement
      ?.closest<HTMLElement>("[data-size-sheet-row]")
      ?.getAttribute("data-size-sheet-row");
    return key ? rows.findIndex((row) => row.key === key) : -1;
  }, [rows]);

  /** The empty T – Pcs line Enter opened becomes the next L × W. */
  const startFace = (cutKey: string): void => {
    const face = createSizeFace(baseRate);
    pendingFocusRef.current = face.key;
    setRows((current) => current.map((row) => (row.key === cutKey ? face : row)));
  };

  /** Open an empty T – Pcs line straight after `index` and put the cursor in its T. */
  const openCutAfter = (index: number): void => {
    const cut = createSizeCut<T>();
    pendingFocusRef.current = cut.key;
    setRows((current) => [...current.slice(0, index + 1), cut, ...current.slice(index + 1)]);
  };

  /** Drop the empty T – Pcs line Enter opened and move on to the L × W below it. */
  const leaveCutFor = (cutKey: string, nextKey: string): void => {
    pendingFocusRef.current = nextKey;
    setRows((current) => current.filter((row) => row.key !== cutKey));
  };

  useEffect(() => {
    const key = pendingFocusRef.current;
    if (!key) {
      return;
    }
    pendingFocusRef.current = null;
    focusRowStart(bodyRef.current, key);
  }, [rows]);

  /**
   * Enter in a dimension box walks on to the next box, the way it walks the cells
   * of the grid behind this dialog. Two boxes on an EMPTY line mean more:
   *  - T on the line Enter just opened: the sizes of this L × W are done. At the
   *    end of the sheet the line becomes the next L × W; above another L × W it
   *    goes, and the cursor moves on to that one;
   *  - L on an L × W at the end of the sheet: there is no next one, so the
   *    cursor goes to OK and the next Enter saves.
   * The cut that holds the document's own line (an item just picked) is never
   * dropped or turned into a face — that would lose the line's identity.
   */
  const onBoxEnter = (
    input: HTMLInputElement,
    row: SizeSheetRow<T>,
    index: number,
    factor: number,
    shiftKey: boolean,
  ): void => {
    if (shiftKey) {
      focusAdjacentField(input, -1);
      return;
    }
    const last = index === rows.length - 1;
    const next = rows[index + 1];
    if (row.kind === "cut" && factor === 2 && row.pristine && !row.source) {
      if (last) {
        startFace(row.key);
        return;
      }
      if (next?.kind === "face") {
        leaveCutFor(row.key, next.key);
        return;
      }
    }
    if (last && row.kind === "face" && factor === 0 && !row.length.trim() && !row.width.trim()) {
      okButtonRef.current?.focus();
      return;
    }
    if (row.kind === "cut" && factor === SIZE_FACTOR_COUNT - 1) {
      finishCut(row, index);
      return;
    }
    focusAdjacentField(input, 1);
  };

  /**
   * A T – Pcs line keyed — Enter on its Pcs. Inside an L × W's lines the cursor
   * goes to the next line's T;
   * on the LAST line of an L × W it opens a T – Pcs under that L × W, wherever
   * it sits in the sheet. Walking on there instead would land in the NEXT
   * L × W's L with its value selected, and the next size keyed would overwrite
   * it.
   *
   * Two cases open nothing, so Enter held down cannot breed rows:
   *  - the line is one Enter itself opened and nothing was keyed into it: the
   *    operator is done — at the end of the sheet the cursor goes to OK and the
   *    next Enter saves, above another L × W it moves on to that one;
   *  - a line that would not pass OK: its error shows and the cursor goes back
   *    to its T.
   */
  const finishCut = (row: SizeSheetRow<T>, index: number): void => {
    const next = rows[index + 1];
    if (next?.kind === "cut") {
      focusRowStart(bodyRef.current, next.key);
      return;
    }
    if (row.pristine) {
      if (next) {
        focusRowStart(bodyRef.current, next.key);
      } else {
        okButtonRef.current?.focus();
      }
      return;
    }
    if (validation.rows[row.key]) {
      setShowErrors(true);
      focusRowStart(bodyRef.current, row.key);
      return;
    }
    openCutAfter(index);
  };

  /**
   * Enter on an L × W's Rate goes on to its first T – Pcs, opening one when it
   * has none yet; an L × W with no L or W keyed adds nothing — at the end of the
   * sheet the cursor goes to OK instead.
   */
  const onRateEnter = (input: HTMLInputElement, row: SizeFaceRow, index: number): void => {
    const next = rows[index + 1];
    if (next?.kind === "cut") {
      focusAdjacentField(input, 1);
      return;
    }
    if (!row.length.trim() && !row.width.trim()) {
      if (next) {
        focusAdjacentField(input, 1);
      } else {
        okButtonRef.current?.focus();
      }
      return;
    }
    openCutAfter(index);
  };

  const removeRow = (key: string): void => {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const next = removeSizeSheetRow(current, key);
      // The × button that had focus is about to unmount, and focus would fall
      // to <body> — where Enter and the arrows do nothing. Hand it to the row
      // that took this one's place, or to the one above when it was the last.
      const neighbour = next[index] ?? next[index - 1] ?? null;
      pendingFocusRef.current = neighbour?.key ?? null;
      return next;
    });
  };

  const save = useCallback((): void => {
    if (!validation.ok) {
      setShowErrors(true);
      return;
    }
    onSave(anchorKey, entries);
    onClose();
  }, [anchorKey, entries, onClose, onSave, validation.ok]);

  /**
   * Ctrl+Enter saves, `+` adds an L × W and Alt+T a T – Pcs — all from a
   * document listener rather than a handler on the dialog's own markup.
   *
   * A React `onKeyDown` only ever sees keys pressed on something inside it, and
   * focus is not reliably there: deleting a row unmounts the button that had it
   * and focus falls back to `<body>`, from where the shortcut was simply dead.
   * Captured for the same reason `ModalShell` captures Escape — it must beat the
   * entry screen's own F-key handler underneath.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `event.code` alongside `event.key`: a layout or IME can report the
      // composed character rather than "Enter", and NumpadEnter is a separate
      // code. Ctrl OR Meta, so a Mac keyboard works without learning a second
      // chord.
      const isEnter =
        event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
      if (isEnter && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }
      // `+` on its own, from the main row (Shift+=) or the keypad. Nothing in
      // this dialog can hold a `+` — every box takes digits and a point only —
      // so the key is free to mean "next L × W" wherever the cursor is.
      // Ctrl/Alt+± stay the item grid's row chords.
      if (
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.key === "+" || event.code === "NumpadAdd")
      ) {
        event.preventDefault();
        event.stopPropagation();
        addRow("face", focusedRowIndex());
        return;
      }
      // By `code`, so the chord is the same key whatever the layout or Caps
      // Lock — and with no other modifier, so AltGr text still types.
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "KeyT") {
        event.preventDefault();
        event.stopPropagation();
        addRow("cut", focusedRowIndex());
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // Re-registered whenever the rows change rather than held in a ref: the
    // listener has to see the rows as they are NOW, and a dialog this small
    // re-binding one handler per keystroke costs nothing.
  }, [addRow, focusedRowIndex, save]);

  const errorsFor = (key: string) => (showErrors ? validation.rows[key] : undefined);

  // The # column counts sizes — the lines OK writes — so L × W lines take none.
  const sizeNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const row of rows) {
      if (row.kind === "cut") {
        numbers.set(row.key, numbers.size + 1);
      }
    }
    return numbers;
  }, [rows]);

  return (
    <ModalShell
      title="Size entry"
      isOpen={group !== null}
      onClose={onClose}
      panelClassName={styles.sizeEntryPanel}
      footer={
        <>
          <span className={styles.modalNote}>
            {entries.length} size{entries.length === 1 ? "" : "s"} · total{" "}
            <strong>
              {/* `formatQty` blanks a zero by design — an item grid full of
                  "0.00" is unreadable. A lone footer total is the opposite case:
                  "total  CFT" with a hole in it just looks broken. */}
              {totals.qty === 0 ? "0.000" : formatQty(totals.qty, 3)} {SIZE_UOM}
            </strong>
            {/* The form-level message too: once the only row left is one Enter
                opened, the grid is not empty, so nothing else would say it. */}
            {showErrors && !validation.ok
              ? ` · ${validation.formError ?? "fix the highlighted sizes to continue"}`
              : ""}
          </span>
          <span className={styles.gridHeadActions}>
            {/* `buttonPrimary` is a MODIFIER — colour only. On its own the button
                keeps the browser's default font size and no padding, which is
                why OK rendered bigger than Cancel and spilled out of its fill.
                Every other primary button on this screen composes the pair. */}
            <button
              type="button"
              className={cx(styles.button, styles.sizeEntryFooterButton)}
              onClick={onClose}
            >
              Cancel-Esc
            </button>
            <button
              ref={okButtonRef}
              type="button"
              className={cx(styles.button, styles.buttonPrimary, styles.sizeEntryFooterButton)}
              onClick={save}
            >
              OK-Ctrl+Enter
            </button>
          </span>
        </>
      }
    >
      <div ref={bodyRef} className={styles.sizeEntry}>
        <dl className={styles.sizeEntryHead}>
          <div>
            <dt>Code</dt>
            <dd>{template?.itemCode || "—"}</dd>
          </div>
          <div className={styles.sizeEntryHeadWide}>
            <dt>Item</dt>
            <dd>{template?.itemName || "—"}</dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{template?.unitName || "—"}</dd>
          </div>
          <div>
            <dt>Base rate</dt>
            <dd>{formatCurrency(baseRate, 2, false)}</dd>
          </div>
        </dl>

        <div className={styles.listViewport}>
          <table className={styles.listTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.sizeEntrySerialCell}>
                  #
                </th>
                <th scope="col" className={styles.sizeEntryPairHead}>
                  L × W
                </th>
                <th scope="col" className={styles.sizeEntryPairHead}>
                  T – Pcs
                </th>
                <th scope="col" className={styles.alignRight}>
                  = {SIZE_UOM}
                </th>
                <th scope="col" className={cx(styles.alignRight, styles.sizeEntryRateCell)}>
                  Rate
                </th>
                <th scope="col" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const errors = errorsFor(row.key);
                // A size that works out to nothing has no Qty cell here to hang
                // its error on, so it reports under the boxes it came from.
                const sizeError = errors?.size ?? errors?.qty;
                const removeButton = (label: string, title: string) => (
                  <td className={styles.sizeEntrySerialCell}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      title={title}
                      aria-label={label}
                      onClick={() => removeRow(row.key)}
                    >
                      ×
                    </button>
                  </td>
                );
                if (row.kind === "face") {
                  const faceLabel = `${row.length || "L"} × ${row.width || "W"}`;
                  return (
                    <tr key={row.key} className={styles.sizeEntryFaceRow} data-size-sheet-row={row.key}>
                      <td className={styles.sizeEntrySerialCell} />
                      <td>
                        <SizePair
                          first={0}
                          values={[row.length, row.width]}
                          rowKey={row.key}
                          invalid={Boolean(sizeError)}
                          autoFocus={index === 0}
                          onChange={([length, width]) =>
                            setRows((current) => patchSizeFace(current, row.key, { length, width }))
                          }
                          onEnter={(input, factor, shiftKey) =>
                            onBoxEnter(input, row, index, factor, shiftKey)
                          }
                        />
                        {sizeError ? <span className={styles.sizeEntryError}>{sizeError}</span> : null}
                      </td>
                      <td />
                      <td />
                      <td className={styles.sizeEntryRateCell}>
                        <input
                          className={cx(styles.cellInput, styles.sizeEntryRateInput)}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          title="Rate — every T – Pcs under this L × W is sold at it"
                          aria-label={`Rate, ${faceLabel}`}
                          value={row.rate}
                          // Digits and a point only: a rate is never negative,
                          // and anything else would read back as 0.
                          onChange={(event) => {
                            const rate = event.target.value.replace(/[^0-9.]/g, "");
                            setRows((current) => patchSizeFace(current, row.key, { rate }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.ctrlKey || event.metaKey) {
                              return;
                            }
                            event.preventDefault();
                            if (event.shiftKey) {
                              focusAdjacentField(event.currentTarget, -1);
                              return;
                            }
                            onRateEnter(event.currentTarget, row, index);
                          }}
                        />
                      </td>
                      {removeButton(
                        `Remove ${faceLabel} and its sizes`,
                        "Remove this L × W and the T – Pcs under it",
                      )}
                    </tr>
                  );
                }

                const sizeNumber = sizeNumbers.get(row.key) ?? 0;
                const faceIndex = sizeFaceIndexOf(rows, index);
                const face = faceIndex >= 0 ? (rows[faceIndex] as SizeFaceRow) : null;
                // The line Enter opened shows no CFT for the L × W above it: that
                // figure is not in the total until the line is keyed.
                const cft = row.pristine
                  ? null
                  : cubicFeetFromSize(joinSizeFactors(sizeCutFactors(row, face)));
                return (
                  <tr key={row.key} data-size-sheet-row={row.key}>
                    <td className={styles.sizeEntrySerialCell}>{sizeNumber}</td>
                    <td />
                    <td>
                      <SizePair
                        first={2}
                        values={[row.thickness, row.pieces]}
                        rowKey={row.key}
                        invalid={Boolean(sizeError)}
                        onChange={([thickness, pieces]) =>
                          setRows((current) => patchSizeCut(current, row.key, { thickness, pieces }))
                        }
                        onEnter={(input, factor, shiftKey) =>
                          onBoxEnter(input, row, index, factor, shiftKey)
                        }
                      />
                      {sizeError ? <span className={styles.sizeEntryError}>{sizeError}</span> : null}
                    </td>
                    {/* Read-only: the quantity this size works out to. Qty is
                        not keyed here — it stays editable on the item grid. */}
                    <td className={cx(styles.alignRight, styles.sizeEntryCftCell)}>
                      {cft === null ? "—" : formatQty(cft, 3)}
                    </td>
                    {/* No Rate of its own: sold at the L × W's above. */}
                    <td className={styles.sizeEntryRateCell} />
                    {removeButton(`Remove size ${sizeNumber}`, "Remove this size")}
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyGrid}>
                    {validation.formError ?? "No sizes on this item."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.sizeEntryActions}>
          {/* No T – Pcs button: Enter on the last Rate already opens the next
              one, and Alt+T adds one under the L × W being keyed. */}
          <button type="button" className={styles.button} onClick={() => addRow("face", null)}>
            + L × W - Press +
          </button>
          <span className={styles.modalNote}>
            Alt+T adds a T – Pcs · Enter on an empty T moves to the next L × W · Enter on an
            empty L goes to OK
          </span>
        </div>
      </div>
    </ModalShell>
  );
}
