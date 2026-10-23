"use client";

/**
 * F9 — "Scheduled prices" (Qt `ScheduledPricesDialog`, notes 140 B).
 *
 * The prices saved to start on a later day: item, unit, branch, from, and per
 * ACTIVE level "110 → 118" where the level changes (the plain price where it
 * does not). "Cancel this change" (or Delete) takes one off after asking; the
 * price in force today then simply carries on. Cancelling needs the Edit right
 * on Change Selling Price (menu 30) — without it the list is read-only and the
 * button says why.
 *
 * Two ways in: Change Selling Price feeds it the list it fetched
 * (`ScheduledPricesDialog`), the Item Master list's Scheduled button mounts
 * `ScheduledPricesLauncher`, which fetches the level names, this branch's name
 * and the schedule itself (Qt `showFor`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import {
  useCancelPriceScheduleMutation,
  useGetSellingPriceBranchNamesQuery,
  useGetSellingPriceLevelNamesQuery,
  useListPriceScheduleQuery,
} from "../selling-price.api";
import { LEVEL_COUNT, SELLING_PRICE_MENU_ID } from "../selling-price.constants";
import { moneyText } from "../selling-price.display";
import { toNum } from "../selling-price.math";
import type {
  PriceLevelMasterRow,
  SellingPriceLevelValue,
  SellingPriceScheduleRow,
} from "../selling-price.types";
import styles from "../page.module.scss";

const DEFAULT_LEVEL_NAMES = ["Level A", "Level B", "Level C", "Level D"] as const;

/** Level names and which levels are on, from `/price-level-masters/get` (Qt `showFor`). */
export function scheduleLevels(rows: readonly PriceLevelMasterRow[] | undefined): {
  names: string[];
  active: boolean[];
} {
  const names: string[] = [...DEFAULT_LEVEL_NAMES];
  const active = names.map(() => true);
  for (const row of rows ?? []) {
    const id = Number(row.priceLvlId);
    if (id < 1 || id > LEVEL_COUNT) continue;
    if (row.priceLvlName?.trim()) names[id - 1] = row.priceLvlName.trim();
    active[id - 1] = row.priceLvlIsActive !== false;
  }
  return { names, active };
}

function levelPrice(levels: readonly SellingPriceLevelValue[] | undefined, level: number): number {
  for (const value of levels ?? []) {
    if (toNum(value?.level) === level + 1) return toNum(value.price);
  }
  return 0;
}

/** `YYYY-MM-DD` → `dd-MM-yyyy`; anything else as it came. */
export function scheduleDateText(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (iso ?? "");
}

/** One list row's cells, as the Qt dialog fills them. `levels` = the active level indexes (0-based). */
export function scheduleCells(
  row: SellingPriceScheduleRow,
  levels: readonly number[],
  branchName: string,
): { item: string; uom: string; branch: string; from: string; prices: string[] } {
  const previous = row.previous;
  return {
    item: row.itemName ?? "",
    uom: row.unitName ?? "",
    branch: String(row.priceScope ?? "") === "CHAIN" ? "All branches" : branchName,
    from: scheduleDateText(String(row.effectiveFrom ?? "")),
    prices: levels.map((level) => {
      const now = levelPrice(row.levels, level);
      const before = levelPrice(previous?.levels, level);
      // "110 → 118" where the level changes; the plain price where it does not.
      return previous && Math.abs(now - before) >= 0.005
        ? `${moneyText(before)} → ${moneyText(now)}`
        : moneyText(now);
    }),
  };
}

export type ScheduledPricesDialogProps = {
  rows: readonly SellingPriceScheduleRow[];
  /** The four level names, A..D. */
  levelNames: readonly string[];
  /** Which of the four levels are on; a level that is off has no column. */
  levelActive: readonly boolean[];
  branchName: string;
  /** False without the Edit right on menu 30: the list is read-only. */
  canCancel: boolean;
  /** `cancelled` = how many rows were taken off while it was open. */
  onClose: (cancelled: number) => void;
};

/** Mounted only while open, on the list the caller fetched for it. */
export function ScheduledPricesDialog(props: ScheduledPricesDialogProps) {
  const { levelNames, levelActive, branchName, canCancel, onClose } = props;
  const [rows, setRows] = useState<SellingPriceScheduleRow[]>(() => [...props.rows]);
  const [active, setActive] = useState(0);
  const [cancelled, setCancelled] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cancelSchedule] = useCancelPriceScheduleMutation();
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const levels: number[] = [];
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    if (levelActive[level] !== false) levels.push(level);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);
  // ModalPortal mounts its content a commit late, so the frame above can find
  // no list yet and leave the focus in the grid behind (Delete would then
  // edit a price): the list also takes the focus the moment it really mounts.
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    if (node && !viewportRef.current) {
      node.focus();
    }
    viewportRef.current = node;
  }, []);

  useEffect(() => {
    viewportRef.current
      ?.querySelector<HTMLTableRowElement>(`tr[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => onClose(cancelled);

  const cancelCurrent = async () => {
    const row = rows[active];
    if (!canCancel || busy || !row) return;
    const cells = scheduleCells(row, levels, branchName);
    const yes = await confirm({
      title: "Cancel this change",
      message: `Take off the new price of ${cells.item} (${cells.uom}) from ${cells.from}?`,
      note: "Today's price carries on.",
      confirmLabel: "Cancel this change",
      cancelLabel: "Keep it",
    });
    if (!yes) {
      // The question took the focus with it: back to the list, so the keys work.
      viewportRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await cancelSchedule({ ipmId: String(row.bucketId ?? "") }).unwrap();
      const next = rows.filter((_, index) => index !== active);
      setRows(next);
      setCancelled((count) => count + 1);
      setActive((index) => Math.min(index, Math.max(next.length - 1, 0)));
    } catch (error) {
      toast.apiError(error, { refusedTitle: "Cannot cancel" });
    } finally {
      setBusy(false);
      viewportRef.current?.focus();
    }
  };

  return (
    <ModalShell
      title="Scheduled prices · F9"
      isOpen
      wide
      onClose={close}
      footer={
        <div className={styles.dialogButtons}>
          <span className={styles.dialogButtonsSpacer} />
          <button
            type="button"
            className={qs.button}
            disabled={!canCancel || busy || rows.length === 0}
            title={
              canCancel
                ? "Delete — take the selected change off. Today's price carries on."
                : "Cancelling needs the Edit right on Change Selling Price."
            }
            onClick={() => void cancelCurrent()}
          >
            Cancel this change
          </button>
          <button type="button" className={`${qs.button} ${qs.buttonPrimary}`} onClick={close}>
            Close
          </button>
        </div>
      }
    >
      <p className={styles.dlgMuted}>
        New prices saved to start on a later day. Until then the price in force today stays.
      </p>
      <div
        ref={attachViewport}
        className={styles.dlgViewport}
        tabIndex={0}
        role="listbox"
        aria-label="Scheduled prices"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Home") {
            event.preventDefault();
            setActive(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setActive(Math.max(rows.length - 1, 0));
          } else if (event.key === "Delete") {
            event.preventDefault();
            void cancelCurrent();
          }
        }}
      >
        <table className={styles.dlgTable}>
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: 240 }}>
                Item
              </th>
              <th scope="col">Uom</th>
              <th scope="col">Branch</th>
              <th scope="col">From</th>
              {levels.map((level) => (
                <th key={level} scope="col">
                  {levelNames[level] || DEFAULT_LEVEL_NAMES[level]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const cells = scheduleCells(row, levels, branchName);
              return (
                <tr
                  key={`${row.bucketId ?? "none"}-${index}`}
                  data-index={index}
                  data-selected={index === active ? "true" : undefined}
                  aria-selected={index === active}
                  onClick={() => setActive(index)}
                >
                  <td>{cells.item}</td>
                  <td>{cells.uom}</td>
                  <td>{cells.branch}</td>
                  <td style={{ textAlign: "center" }}>{cells.from}</td>
                  {cells.prices.map((text, k) => (
                    <td key={levels[k]} style={{ textAlign: "right" }}>
                      {text}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4 + levels.length} className={styles.emptyGrid}>
                  Nothing is scheduled.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

export type ScheduledPricesLauncherProps = {
  /** Narrow the list to one item. */
  itemId?: string;
  onClose: (cancelled: number) => void;
};

/**
 * From anywhere (the Item Master list's Scheduled button): fetches the level
 * names, this branch's name and the schedule for the session's company and
 * branch, then shows the list. Mount it only while open.
 */
export function ScheduledPricesLauncher({ itemId, onClose }: ScheduledPricesLauncherProps) {
  const business = useBusinessContext();
  const companyId = business.selectedCompanyId ?? "";
  const branchId = business.selectedBranchId ?? "";
  const { permissions } = usePagePermissions({ menuId: SELLING_PRICE_MENU_ID });
  const levelQuery = useGetSellingPriceLevelNamesQuery();
  const branchQuery = useGetSellingPriceBranchNamesQuery(branchId, { skip: !branchId });
  const scheduleQuery = useListPriceScheduleQuery(
    { companyId, branchId, ...(itemId ? { itemId } : {}) },
    { skip: !companyId || !branchId, refetchOnMountOrArgChange: true },
  );
  const reported = useRef(false);

  const failure = levelQuery.error ?? scheduleQuery.error;
  useEffect(() => {
    if (failure && !reported.current) {
      reported.current = true;
      toast.apiError(failure, { fallback: "Could not read the scheduled prices." });
      onClose(0);
    }
  }, [failure, onClose]);

  useEffect(() => {
    if ((!companyId || !branchId) && !reported.current) {
      reported.current = true;
      toast.warn("Pick a company and branch first.");
      onClose(0);
    }
  }, [branchId, companyId, onClose]);

  if (failure || !scheduleQuery.data || levelQuery.isLoading || (branchId && branchQuery.isLoading)) {
    return null;
  }
  const { names, active } = scheduleLevels(levelQuery.data);
  return (
    <ScheduledPricesDialog
      rows={scheduleQuery.data}
      levelNames={names}
      levelActive={active}
      branchName={branchQuery.data?.brName || "This branch"}
      canCancel={permissions.canEdit}
      onClose={onClose}
    />
  );
}
