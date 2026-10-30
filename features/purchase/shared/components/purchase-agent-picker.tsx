"use client";

/**
 * Agent picker (Qt `openAgentPicker`: grid 194 MAIN LIST - PURCHASE AGENTS —
 * no agents dropdown is registered). Used by Purchase Entry and the PO. A
 * one-shot GET-mutation read (house RTK rule: abortable, no shared cache key).
 * Type to filter, ↑ / ↓, Enter picks, Esc closes.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useGridId } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { baseApi } from "@/store/api/baseApi";
import styles from "./purchase-parts.module.scss";

export type PurchaseAgentRow = { id: string; name: string; code: string; city: string; commPct: string };

type GridPage = { items?: Record<string, unknown>[] };

const agentPickerApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    purchaseAgentGridRun: builder.mutation<Record<string, unknown>[], { gridId: string; companyId: string }>({
      query: ({ gridId, companyId }) => ({
        url: "/configured-grid-sql/run",
        method: "GET",
        // grid 194 binds 'icompany_id' and 'iinactive' — both always sent
        params: { grid_id: gridId, page: 1, limit: 500, grid_param: JSON.stringify({ icompany_id: companyId, iinactive: "false" }) },
      }),
      transformResponse: (payload: { data?: GridPage }) => payload?.data?.items ?? [],
    }),
  }),
});

const { usePurchaseAgentGridRunMutation } = agentPickerApi;

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export type PurchaseAgentPickerProps = {
  open: boolean;
  companyId: string;
  onPick: (agent: PurchaseAgentRow) => void;
  onClose: () => void;
};

export function PurchaseAgentPicker(props: PurchaseAgentPickerProps) {
  return props.open ? <OpenAgentPicker {...props} /> : null;
}

function OpenAgentPicker({ companyId, onPick, onClose }: PurchaseAgentPickerProps) {
  const gridId = useGridId("purchaseAgentList");
  const [run, { isLoading }] = usePurchaseAgentGridRunMutation();
  const [rows, setRows] = useState<PurchaseAgentRow[]>([]);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!gridId || !companyId) return;
    const request = run({ gridId, companyId });
    request
      .unwrap()
      .then((items) =>
        setRows(
          items.map((row) => ({
            id: text(row.pag_id),
            name: text(row.pag_name),
            code: text(row.pag_code),
            city: text(row.pag_city),
            commPct: text(row.pag_default_comm_pct),
          })),
        ),
      )
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") toast.apiError(error, { title: "Agents" });
      });
    return () => request.abort();
  }, [companyId, gridId, run]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((row) => `${row.name} ${row.code} ${row.city}`.toLowerCase().includes(q)) : rows;
  }, [query, rows]);

  const pick = (row: PurchaseAgentRow | undefined) => {
    if (!row) return;
    onPick(row);
    onClose();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCurrent((at) => Math.min(Math.max(0, shown.length - 1), Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(shown[current]);
    }
  };

  return (
    <ModalShell
      title="Select Agent"
      isOpen
      fixedHeight
      panelClassName={styles.pickerPanel}
      onClose={onClose}
      footer={
        <button type="button" className={quotationStyles.button} onClick={onClose}>
          Cancel
        </button>
      }
    >
      <input
        ref={inputRef}
        autoFocus
        className={styles.input}
        placeholder="Type to search agents"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCurrent(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div className={styles.list} role="listbox" style={{ marginTop: "0.4em" }}>
        {isLoading ? <div className={styles.listEmpty}>Loading…</div> : null}
        {!isLoading && shown.length === 0 ? <div className={styles.listEmpty}>No agents.</div> : null}
        {shown.map((row, index) => (
          <button
            key={row.id}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={index === current}
            className={cx(styles.listRow, index === current && styles.listRowCurrent)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setCurrent(index)}
            onDoubleClick={() => pick(row)}
          >
            <span>{row.name}</span>
            <span className={styles.footerNote}>{[row.code, row.city, row.commPct ? `${Number(row.commPct)} %` : ""].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
