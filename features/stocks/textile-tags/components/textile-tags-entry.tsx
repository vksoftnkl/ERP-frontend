"use client";

/**
 * The New tags tab (mockup REV 3): key the lines (or a size grid), reserve
 * the barcodes — the port of `TextileTagEntry`'s `tabNew`.
 *
 * Layout and wiring only. What a change does to the lines is
 * `domain/textile-tag-lines.ts`; the round trips are `use-textile-tag-entry.ts`.
 *
 * Keys, as the Qt screen binds them: Ctrl+Enter (and F5) reserve, Esc closes
 * after a question when lines are not reserved yet. Plain Enter belongs to the
 * grid, which is why no button here is a default button.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { DateField } from "@/features/sales/quotation/components/fields";
import { focusCell, focusLastCellAfterRender, focusNextStopFrom } from "@/features/sales/quotation/components/grid-focus";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { GridPickerModal, type PickerFallbackColumn } from "@/features/stocks/opening-stock/components/grid-picker-modal";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getUserInfo } from "@/lib/auth/session";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { findGridIdByName, useGridId } from "@/lib/configured-grids";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetGridDirectoryQuery } from "@/store/api/metadataApi";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { previewOf, TAG_SOURCES, type TagSource } from "../domain/textile-tag-lines";
import { resolveTextileTagColumns } from "../textile-tags.columns";
import {
  BRAND_DROPDOWN_KEY,
  BRAND_PICKER_GRID_FALLBACK_ID,
  BRAND_PICKER_GRID_NAME,
  ITEM_DROPDOWN_KEY,
  ITEM_PICKER_GRID_KEY,
  NO_TAX_NOTE,
  PREVIEW_NOTE,
  RESERVE_PRINT_TOOLTIP,
  SUPPLIER_DROPDOWN_KEY,
  TEXTILE_TAG_GRID_NAME,
  TEXTILE_TAG_LINES_UI_TABLE_KEY,
  TEXTILE_TAG_ROUTE_HREF,
} from "../textile-tags.constants";
import type { PickerRow } from "../textile-tags.types";
import { useTextileTagEntry } from "../use-textile-tag-entry";
import styles from "../page.module.scss";
import { SizeGridCard } from "./size-grid-card";
import { TextileLabelPreview } from "./textile-label-preview";
import { TextileTagGrid } from "./textile-tag-grid";

const ITEM_PICKER_FALLBACK: readonly PickerFallbackColumn[] = [
  { field: "item_name_en", header: "Name" },
  { field: "unit_name", header: "Uom" },
];
const BRAND_PICKER_FALLBACK: readonly PickerFallbackColumn[] = [
  { field: "brand_name", header: "Brand" },
  { field: "brand_short", header: "Short" },
];

type Picker = { kind: "item" | "brand"; key: string; query: string } | null;

function text(row: PickerRow, field: string): string {
  const value = row[field];
  return value === null || value === undefined ? "" : String(value);
}

/** "MM/yyyy" of today — the label's "Packed" month is the day the tag is reserved. */
function packedMonth(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

/** Lands on a named cell once React has rendered the row it is on. */
function focusCellAfterRender(rowKey: string, field: string): void {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      focusCell(TEXTILE_TAG_GRID_NAME, rowKey, field);
    }, 0);
  });
}

export type TextileTagsEntryProps = {
  /** The New tags tab is the one on screen: its window keys are live. */
  active: boolean;
  onClose: () => void;
};

export function TextileTagsEntry({ active, onClose }: TextileTagsEntryProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const deviceId = getUserInfo()?.deviceId ?? "";
  const scope = useMemo(() => ({ companyId, branchId, accYear, deviceId }), [accYear, branchId, companyId, deviceId]);

  const { permissions } = usePagePermissions({ href: TEXTILE_TAG_ROUTE_HREF });

  const focusRow = useCallback((key: string) => focusCellAfterRender(key, "itemName"), []);
  const api = useTextileTagEntry({ scope, today: todayIso(), canCreate: permissions.canCreate, focusRow });
  const { state } = api;

  // ── The layout (ui_table 53) ──────────────────────────────────────────
  const uiTableId = useUiTableId(TEXTILE_TAG_LINES_UI_TABLE_KEY);
  const { data: layoutRows } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const configuredColumns = useMemo(() => resolveTextileTagColumns(layoutRows), [layoutRows]);
  const columnResize = useColumnResize(configuredColumns, uiTableId);
  const gridSettings = useGridSettings({
    label: "Textile tag lines",
    uiTableId,
    columns: columnResize.columns,
    pendingWidthCount: columnResize.pendingCount,
    savingWidths: columnResize.saving,
    onSaveWidths: columnResize.saveWidths,
  });
  const columns = columnResize.columns;

  // ── The pickers and dropdowns ─────────────────────────────────────────
  const itemGridId = useGridId(ITEM_PICKER_GRID_KEY);
  const { data: gridDirectory } = useGetGridDirectoryQuery();
  const brandGridId = useMemo(
    () => findGridIdByName(BRAND_PICKER_GRID_NAME, gridDirectory ?? []) ?? BRAND_PICKER_GRID_FALLBACK_ID,
    [gridDirectory],
  );
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const itemDropdownId = useDropdownId(ITEM_DROPDOWN_KEY);
  const brandDropdownId = useDropdownId(BRAND_DROPDOWN_KEY);
  // Grid 71 is scoped to this company and branch, so it cannot offer an item
  // the lookup will then refuse. Grid 91 binds nothing.
  const itemPickerParams = useMemo(
    () => ({ iitem_company_id: companyId, iitem_branch_id: branchId }),
    [branchId, companyId],
  );

  const [picker, setPicker] = useState<Picker>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);

  const pickItem = useCallback(
    (row: PickerRow) => {
      if (!picker) {
        return;
      }
      const key = picker.key;
      api.setItemOnRow(key, text(row, "item_id"), text(row, "item_name_en"), text(row, "item_uom_id"));
      setPicker(null);
      // The pick leaves focus in a dismissed dialog: hand the chain back, one
      // stop past Item, once the row's other cells have opened.
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!focusNextStopFrom(TEXTILE_TAG_GRID_NAME, key, "itemName")) {
            focusCell(TEXTILE_TAG_GRID_NAME, key, "itemName");
          }
        }, 0);
      });
    },
    [api, picker],
  );

  const pickBrand = useCallback(
    (row: PickerRow) => {
      if (!picker) {
        return;
      }
      const key = picker.key;
      api.setBrandOnRow(key, text(row, "brand_id"), text(row, "brand_name"));
      setPicker(null);
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!focusNextStopFrom(TEXTILE_TAG_GRID_NAME, key, "brandName")) {
            focusCell(TEXTILE_TAG_GRID_NAME, key, "brandName");
          }
        }, 0);
      });
    },
    [api, picker],
  );

  // ── Actions ───────────────────────────────────────────────────────────
  const close = useCallback(async () => {
    if (await api.confirmDiscard("Close Textile Tags")) {
      onClose();
    }
  }, [api, onClose]);

  const reserve = useCallback(() => {
    // Commit whatever is being typed into a cell first: the cell holds its
    // edit until it loses focus, and the reserve reads the state.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body && typeof focused.blur === "function") {
      focused.blur();
    }
    void api.reserve();
  }, [api]);

  // ── Window keys ───────────────────────────────────────────────────────
  const keyStateRef = useRef({ active, reserve, close, settingsActive: gridSettings.active });
  useLayoutEffect(() => {
    keyStateRef.current = { active, reserve, close, settingsActive: gridSettings.active };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keyStateRef.current;
      if (!current.active || current.settingsActive || event.defaultPrevented || event.altKey || event.metaKey) {
        return;
      }
      // A dialog over the screen owns the keyboard — but F5 must not reload
      // the page behind it and take the unreserved lines with it.
      if (document.querySelector('[aria-modal="true"]')) {
        if (event.key === "F5") {
          event.preventDefault();
        }
        return;
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        current.reserve();
        return;
      }
      if (event.ctrlKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.key === "F5") {
        event.preventDefault();
        current.reserve();
        return;
      }
      if (event.key === "Escape") {
        // An open dropdown list takes its own Escape.
        if (target?.getAttribute("aria-expanded") === "true") {
          return;
        }
        event.preventDefault();
        void current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // An unreserved batch asks before the tab closes, as Close does.
  useEffect(() => {
    if (api.pending === 0) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [api.pending]);

  // ── Derived ───────────────────────────────────────────────────────────
  const preview = useMemo(() => previewOf(state, activeKey, packedMonth()), [activeKey, state]);
  const seasonNames = useMemo(() => state.lists.seasons.map((season) => season.name), [state.lists.seasons]);
  const supplierValue = useMemo<DropdownSelection | null>(
    () => (state.header.supplierId ? { id: state.header.supplierId, text: state.header.supplierName } : null),
    [state.header.supplierId, state.header.supplierName],
  );
  const seasonListId = "textile-tag-header-seasons";

  return (
    <>
      <div className={styles.headerRow}>
        <label className={quotationStyles.label} htmlFor="textile-tag-source">Source</label>
        <select
          id="textile-tag-source"
          className={quotationStyles.select}
          value={state.header.source}
          title="What the tags are for. Opening stock: reserve the tags here, then post the Opening with batch = barcode. Purchase arrives with the purchase screen."
          onChange={(event) => api.setHeader({ source: event.target.value as TagSource })}
        >
          {TAG_SOURCES.map((source) => (
            <option key={source.value || "tags-only"} value={source.value} title={source.title}>
              {source.label}
            </option>
          ))}
        </select>
        <label className={quotationStyles.label} htmlFor="textile-tag-supplier">Supplier</label>
        <NexDropdownSingle
          id="textile-tag-supplier"
          dropdownId={supplierDropdownId}
          value={supplierValue}
          placeholder="optional"
          onChange={(selection) =>
            api.setHeader({ supplierId: selection?.id ?? "", supplierName: selection?.text ?? "" })
          }
        />
        <DateField id="textile-tag-date" label="Date" value={state.header.docDate} onChange={api.setDate} />
        <label className={quotationStyles.label} htmlFor="textile-tag-season">Season</label>
        <input
          id="textile-tag-season"
          className={quotationStyles.input}
          value={state.header.seasonText}
          placeholder="none"
          list={seasonListId}
          autoComplete="off"
          title="Every line takes this season (G21). A line can have its own: show the Season column from the grid's column chooser."
          onChange={(event) => api.setSeasonText(event.target.value)}
        />
        <datalist id={seasonListId}>
          {state.lists.seasons.map((season) => (
            <option key={season.id} value={season.name} />
          ))}
        </datalist>
        <label className={quotationStyles.label} htmlFor="textile-tag-series">Device series</label>
        <input
          id="textile-tag-series"
          className={cx(quotationStyles.input, quotationStyles.inputReadOnly, styles.seriesInput)}
          value={state.seriesCode}
          readOnly
          tabIndex={-1}
          placeholder="set by the admin (Series tab)"
          title="This counter's tag code. The admin gives each device one code in the Series tab; a device without one cannot reserve tags."
        />
      </div>

      <SizeGridCard
        lists={state.lists}
        itemDropdownId={itemDropdownId}
        brandDropdownId={brandDropdownId}
        disabled={state.reserving}
        onAdd={api.addSizeGridLines}
      />

      <div className={styles.linesRow}>
        <section className={cx(quotationStyles.gridShell, styles.linesShell)}>
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Lines</span>
            <span className={quotationStyles.modalNote}>
              Enter next cell · + / - line · type on Item or Brand to search · Ctrl+Enter reserves
            </span>
          </div>
          {gridSettings.overlays}
          <TextileTagGrid
            columns={columns}
            onContextMenu={gridSettings.onContextMenu}
            resizingKey={columnResize.resizingKey}
            onColumnResizeStart={columnResize.onResizeStart}
            lines={state.lines}
            lists={state.lists}
            seasonNames={seasonNames}
            problemKeys={api.problemKeys}
            activeKey={activeKey}
            onActiveKeyChange={setActiveKey}
            onTypeCell={api.typeCell}
            onOpenItemPicker={(key, typed) => setPicker({ kind: "item", key, query: typed })}
            onOpenBrandPicker={(key, typed) => setPicker({ kind: "brand", key, query: typed })}
            onNewLine={() => focusLastCellAfterRender(TEXTILE_TAG_GRID_NAME, "itemName")}
            onRemoveLine={api.removeLine}
            onRefuse={api.showHint}
            onCtrlEnter={reserve}
          />
          <p
            className={cx(
              styles.validation,
              api.validation.tone === "ok" && styles.validationOk,
              api.validation.tone === "error" && styles.validationError,
            )}
            role="status"
          >
            {api.validation.text}
          </p>
          <p className={styles.noTaxNote}>{NO_TAX_NOTE}</p>
          <p className={styles.hint} aria-live="polite">{state.hint}</p>
        </section>

        <aside className={styles.previewPanel} aria-label="Label preview">
          <h2 className={styles.cardTitle}>{preview ? `LABEL PREVIEW (line ${preview.index + 1})` : "LABEL PREVIEW"}</h2>
          <TextileLabelPreview label={preview?.label ?? null} />
          <p className={styles.previewCopies}>
            {preview ? (preview.labels > 1 ? `Copies: ${preview.labels} labels for this line` : "Copies: 1 label") : ""}
          </p>
          <p className={styles.previewNote}>{preview ? PREVIEW_NOTE : ""}</p>
        </aside>
      </div>

      <div className={styles.footerRow}>
        <p className={styles.footNote}>{state.footNote}</p>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={state.reserving}
          title="Start a new batch of lines."
          onClick={() => void api.clearLines()}
        >
          Clear
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={!api.reserveEnabled}
          title="F5 / Ctrl+Enter — take the barcodes for every line. Nothing touches stock: the Opening (or purchase) that carries batch = barcode brings the stock in."
          onClick={reserve}
        >
          {state.reserving ? "Reserving…" : "Reserve"} <span className={quotationStyles.buttonHint}>Ctrl+Enter</span>
        </button>
        <button type="button" className={quotationStyles.button} disabled title={RESERVE_PRINT_TOOLTIP}>
          Reserve &amp; print
        </button>
        <button type="button" className={quotationStyles.button} disabled={state.reserving} onClick={() => void close()}>
          Close <span className={quotationStyles.buttonHint}>Esc</span>
        </button>
      </div>

      <GridPickerModal
        isOpen={picker?.kind === "item"}
        title="Select item"
        gridId={itemGridId}
        params={itemPickerParams}
        initialQuery={picker?.kind === "item" ? picker.query : ""}
        searchPlaceholder="Search by item name…"
        fallbackColumns={ITEM_PICKER_FALLBACK}
        rowKeyField="item_uom_id"
        onClose={closePicker}
        onPick={pickItem}
      />
      <GridPickerModal
        isOpen={picker?.kind === "brand"}
        title="Select brand"
        gridId={brandGridId}
        initialQuery={picker?.kind === "brand" ? picker.query : ""}
        searchPlaceholder="Search by brand name…"
        fallbackColumns={BRAND_PICKER_FALLBACK}
        rowKeyField="brand_id"
        onClose={closePicker}
        onPick={pickBrand}
      />
    </>
  );
}
