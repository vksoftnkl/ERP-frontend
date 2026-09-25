"use client";
/**
 * The Ledger picker (plan §3.2): the house dropdown (popup grid, keyboard,
 * loading / empty / error states), fed by `/reports/ledger-statement/ledgers`
 * instead of the grid runner. Debounced at 200 ms, and the request in flight
 * is aborted on the next keystroke.
 *
 * It borrows `DropdownPopup`, `useDropdownKeys` and the dropdown's own skin, so
 * it looks and keys exactly like every other dropdown in the app.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MutableRefObject,
} from "react";
import { cx } from "@/components/design-system/cx";
import {
  DropdownPopup,
  useDropdownKeys,
  type DropdownColumn,
  type DropdownConfig,
  type DropdownRow,
} from "@/components/design-system/dropdown";
import dropdownStyles from "@/components/design-system/dropdown/nex-dropdown.module.scss";
import type { LedgerStatementClient } from "../api/ledger-statement";
import { isAborted } from "../api/abort";
import { toLedgerError } from "../wire/errors";
import type { LedgerPickItem } from "../wire/types";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_LIMIT = 30;

const COLUMNS: DropdownColumn[] = [
  { jsonKey: "name", heading: "Name", dataType: "Text", align: "left", width: 46, visible: true, filterable: true },
  { jsonKey: "groupName", heading: "Group", dataType: "Text", align: "left", width: 30, visible: true, filterable: false },
  { jsonKey: "billWise", heading: "Bill-wise", dataType: "Text", align: "center", width: 12, visible: true, filterable: false },
  { jsonKey: "shared", heading: "Shared", dataType: "Text", align: "center", width: 12, visible: true, filterable: false },
];

const CONFIG: DropdownConfig = {
  dropdownId: "ledger-statement-ledgers",
  name: "Ledgers",
  completionKey: "name",
  sortColumn: "name",
  sortOrder: "asc",
  maxVisibleItems: 12,
  showHeader: true,
  widthPercent: 36,
  columns: COLUMNS,
};

function toRow(item: LedgerPickItem): DropdownRow {
  return {
    ...item,
    billWise: item.isBillByBill ? "Bill-wise" : "",
    shared: item.isShared ? "Shared" : "",
  };
}

export type LedgerPickerProps = {
  client: LedgerStatementClient;
  companyId: string;
  value: { id: string; text: string } | null;
  onPick: (item: LedgerPickItem) => void;
  invalid?: boolean;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
};

export function LedgerPicker({ client, companyId, value, onPick, invalid, inputRef }: LedgerPickerProps) {
  const controlId = useId();
  const listId = `${controlId}-list`;
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<LedgerPickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const search = (query ?? "").trim();

  useEffect(() => {
    if (!open || !companyId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      client
        .searchLedgers({ companyId, search: search || undefined, limit: SEARCH_LIMIT }, controller.signal)
        .then((payload) => {
          setItems(payload.items);
          setLoading(false);
        })
        .catch((failure: unknown) => {
          if (isAborted(failure, controller.signal)) return;
          setError(toLedgerError(failure).message);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, companyId, open, search, retryTick]);

  const rows = useMemo(() => items.map(toRow), [items]);

  const commit = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      setOpen(false);
      setQuery(null);
      onPick(item);
    },
    [items, onPick],
  );

  const keys = useDropdownKeys({
    open,
    setOpen,
    rowCount: rows.length,
    resetKey: `${companyId}|${search}`,
    onChoose: commit,
  });

  const close = useCallback(() => {
    keys.closeMenu();
    setQuery(null);
  }, [keys]);

  // The popup is portaled, so an outside-click test must look inside it too.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || fieldRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [close, open]);

  const onBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && (event.currentTarget.contains(next) || popupRef.current?.contains(next))) return;
      close();
    },
    [close],
  );

  const setInput = (node: HTMLInputElement | null) => {
    ownInputRef.current = node;
    if (inputRef) inputRef.current = node;
  };

  return (
    <div ref={fieldRef} className={dropdownStyles.field} onBlur={onBlur}>
      <input
        ref={setInput}
        className={cx(dropdownStyles.input, invalid && dropdownStyles.inputInvalid)}
        value={query ?? value?.text ?? ""}
        placeholder="Search ledger (Ctrl+L)"
        autoComplete="off"
        data-uppercase="off"
        role="combobox"
        aria-label="Ledger"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-activedescendant={
          open && keys.engaged && rows.length > 0 ? `${controlId}-option-${keys.highlight}` : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value);
          keys.engage();
        }}
        onKeyDown={keys.handleKeyDown}
        onMouseDown={() => {
          if (!open) keys.openMenu();
        }}
        onFocus={(event) => event.target.select()}
      />
      <button
        type="button"
        className={dropdownStyles.chevron}
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault();
          if (open) {
            close();
          } else {
            keys.openMenu();
            ownInputRef.current?.focus();
          }
        }}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open ? (
        <DropdownPopup
          anchorRef={fieldRef}
          columns={COLUMNS}
          config={CONFIG}
          emptyText={search ? "No ledger matches" : "No ledgers"}
          errorMessage={error}
          hasMore={false}
          highlight={keys.highlight}
          listId={listId}
          loading={loading}
          onChoose={commit}
          onHighlight={keys.setHighlight}
          onLoadMore={() => undefined}
          onRetry={() => setRetryTick((t) => t + 1)}
          optionId={(index) => `${controlId}-option-${index}`}
          popupRef={popupRef}
          rows={rows}
          total={rows.length}
        />
      ) : null}
    </div>
  );
}
