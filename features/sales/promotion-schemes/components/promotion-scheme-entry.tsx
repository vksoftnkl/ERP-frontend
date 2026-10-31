"use client";

/**
 * Promotion Scheme entry — Qt `PromotionSchemeEntry` (menu 247): five tabs
 * (Scheme, Branches, Customers, Items, Offer bands) over one campaign, saved
 * whole by ONE POST.
 *
 * Interlocks, as Qt:
 *  - Benefit decides which band and item-rate columns exist; changing it on a
 *    scheme with bands asks, then clears them (a band's benefit is locked to
 *    the header's). FIXED_PRICE / DISC_PER_ITEM force an item-level trigger.
 *  - The three scopes decide which grids are live (Branches / Customers tabs
 *    are disabled under ALL; the Items grid is read-only under ALL).
 *  - APPROVED stamps the signed-in user as approver.
 *  - A Kind change on a row that already names a target asks, then clears it.
 *
 * Keys: Enter moves to the next field or cell, Ctrl+Enter saves, Ctrl+Del (or
 * Ctrl+-) removes the focused row of the visible grid, Esc closes (asking
 * when there are unsaved changes). Plain Enter never saves.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/design-system/ui";
import { cx } from "@/components/design-system/cx";
import ModalPortal from "@/components/ui/modal-portal";
import { useBusinessContext } from "@/components/layout/business-context";
import { GridPickerModal, type PickerFallbackColumn } from "@/features/stocks/opening-stock/components/grid-picker-modal";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { confirm, getConfirmations } from "@/lib/confirm";
import { formatLocalDate } from "@/lib/date-format";
import { getMessages, toast } from "@/lib/notify";
import { useAppDispatch } from "@/store/hooks";
import { lookupsApi } from "@/store/api/lookupsApi";
import { useReadPromotionSchemeMutation, useSavePromotionSchemeMutation } from "../promotion-schemes.api";
import {
  BRANCH_PICKER,
  ITEM_PICKER,
  ITEM_SCOPES,
  ITEM_UNIT_ID_KEY,
  ITEM_UNIT_NAME_KEY,
  PARTY_SCOPES,
  PROMOTION_SCHEMES_MENU_ID,
  benefitUsesBands,
  findScope,
  type PickerSpec,
  type PromotionApplyOn,
  type PromotionBenefit,
  type PromotionItemKind,
  type PromotionPartyKind,
  type PromotionStatus,
} from "../promotion-schemes.vocab";
import {
  buildSavePayload,
  newSchemeForm,
  realRowCount,
  schemeFormFromPayload,
  schemeReducer,
  triggerRefused,
  validateScheme,
  type GridName,
  type ItemUnit,
  type SchemeProblem,
  type SchemeTab,
} from "../promotion-schemes.state";
import { useGridRefResolver } from "../use-grid-ref-id";
import { GridHelp } from "./grid-help";
import { BranchGrid, ItemGrid, PartyGrid, SlabGrid, cellFocusKey, type PickRequest } from "./rule-grids";
import { SchemeTab as SchemeTabView, headerFieldId } from "./scheme-tab";
import styles from "../page.module.scss";

const TABS: readonly { id: SchemeTab; label: string; heading?: string }[] = [
  { id: "scheme", label: "Scheme" },
  { id: "branches", label: "Branches", heading: "Branches  ·  an EXCLUDE row beats an INCLUDE row" },
  { id: "parties", label: "Customers", heading: "Customers  ·  the narrowest rule wins" },
  { id: "items", label: "Items", heading: "Item Scope  ·  which lines the offer looks at" },
  { id: "slabs", label: "Offer bands", heading: "Offer Bands  ·  bands are rows, not columns" },
];

/** What the Enter walk visits: the fields and cells, then Save. */
const WALK_SELECTOR = '[data-walk="true"]:not(:disabled), button[data-entry-save]:not(:disabled)';

type OpenPicker = PickRequest & { spec: PickerSpec; gridId: string; heading: string };

export type PromotionSchemeEntryProps = {
  /** prm_id to edit; null opens a new scheme. */
  schemeId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PromotionSchemeEntry({ schemeId, onClose, onSaved }: PromotionSchemeEntryProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(false);
  const appDispatch = useAppDispatch();
  const { activeCompany } = useBusinessContext();
  const { permissions } = usePagePermissions({ menuId: PROMOTION_SCHEMES_MENU_ID });
  const resolveGrid = useGridRefResolver();
  const [readScheme] = useReadPromotionSchemeMutation();
  const [saveScheme, { isLoading: saving }] = useSavePromotionSchemeMutation();

  const [form, dispatch] = useReducer(schemeReducer, undefined, () =>
    newSchemeForm({ today: new Date(), companyId: activeCompany?.id ?? "", companyName: activeCompany?.name ?? "" }),
  );
  // The form as last committed — what an awaited confirm or a key handler reads.
  const formRef = useRef(form);
  useLayoutEffect(() => {
    formRef.current = form;
  }, [form]);
  const [tab, setTab] = useState<SchemeTab>("scheme");
  const [loading, setLoading] = useState(Boolean(schemeId));
  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const [focusRequest, setFocusRequest] = useState<string | null>(`field:${headerFieldId("code")}`);
  const [units, setUnits] = useState<ReadonlyMap<string, ItemUnit[]>>(() => new Map());
  const unitsInFlight = useRef(new Set<string>());

  const editing = Boolean(schemeId);
  const mayWrite = editing ? permissions.canEdit : permissions.canCreate;
  const h = form.header;

  // ── Load ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!schemeId) return;
    const request = readScheme(schemeId);
    let active = true;
    request
      .unwrap()
      .then((data) => {
        if (!active) return;
        dispatch({ type: "load", form: schemeFormFromPayload(data) });
        setLoading(false);
        setFocusRequest(`field:${headerFieldId("code")}`);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        toast.apiError(error, { fallback: "The scheme could not be read." });
        onClose();
      });
    return () => {
      active = false;
      request.abort();
    };
  }, [onClose, readScheme, schemeId]);

  // ── Units of the items named (iuc_id, not unit_id), cached per item ───────

  const unitsFor = useCallback((itemId: string) => units.get(itemId), [units]);

  useEffect(() => {
    const wanted = new Set<string>();
    for (const row of form.items) if (row.kind === "ITEM" && row.scopeId) wanted.add(row.scopeId);
    for (const row of form.slabs) if (row.freeItemId) wanted.add(row.freeItemId);
    for (const itemId of wanted) {
      if (units.has(itemId) || unitsInFlight.current.has(itemId)) continue;
      unitsInFlight.current.add(itemId);
      appDispatch(lookupsApi.endpoints.getUnitsByItem.initiate({ itemId }, { subscribe: false }))
        .unwrap()
        .then((options) => {
          setUnits((current) => {
            const next = new Map(current);
            next.set(
              itemId,
              (options ?? []).map((option) => ({ id: String(option.value), name: String(option.label) })),
            );
            return next;
          });
        })
        .catch((error: unknown) => toast.apiError(error, { fallback: "The item's units could not be read." }))
        .finally(() => unitsInFlight.current.delete(itemId));
    }
  }, [appDispatch, form.items, form.slabs, units]);

  // ── Focus requests (open, validation) ─────────────────────────────────────

  useEffect(() => {
    if (!focusRequest || loading || picker) return;
    const handle = window.setTimeout(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>(`[data-focus-key="${focusRequest}"]`);
      const focusable =
        target && (target.matches("input, select, button, textarea") ? target : target.querySelector<HTMLElement>("input, select, button"));
      if (focusable) {
        focusable.focus();
        if (focusable instanceof HTMLInputElement && focusable.type === "text") focusable.select();
      }
      setFocusRequest(null);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [focusRequest, loading, picker, tab]);

  // ── Header interlocks ───────────────────────────────────────────────────

  const onStatus = useCallback((status: PromotionStatus) => {
    if (status !== "APPROVED") {
      dispatch({ type: "status", status, approver: null });
      return;
    }
    const userId = getAuthUserId() ?? "";
    if (!userId) {
      toast.info("No signed-in user to record as the approver.", { title: "Cannot approve" });
      dispatch({ type: "status", status, approver: null });
      return;
    }
    const now = new Date();
    dispatch({
      type: "status",
      status,
      approver: {
        userId,
        userName: getUserInfo()?.userName ?? "",
        nowIso: now.toISOString(),
        todayLabel: formatLocalDate(now),
      },
    });
  }, []);

  const tellTriggerRefused = useCallback((benefit: string) => {
    toast.info(
      `A ${benefit} benefit needs an item-level trigger — a bill total has no line to attach the offer to. Left on ITEM_QTY.`,
      { title: "Trigger not allowed" },
    );
  }, []);

  const onApplyOn = useCallback(
    (applyOn: PromotionApplyOn) => {
      const benefit = formRef.current.header.benefit;
      dispatch({ type: "applyOn", applyOn });
      if (triggerRefused(benefit, applyOn)) tellTriggerRefused(benefit);
    },
    [tellTriggerRefused],
  );

  const onBenefit = useCallback(
    async (benefit: PromotionBenefit) => {
      const current = formRef.current;
      if (benefit === current.header.benefit) return;
      const bands = realRowCount(current.slabs);
      if (
        bands > 0 &&
        !(await confirm({
          title: "Change benefit",
          message: `Changing the benefit clears all ${bands} offer band(s), because a band's benefit is locked to the scheme's. Continue?`,
          confirmLabel: "Continue",
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      dispatch({ type: "benefit", benefit });
      if (triggerRefused(benefit, formRef.current.header.applyOn)) tellTriggerRefused(benefit);
    },
    [tellTriggerRefused],
  );

  // ── Grid interlocks ─────────────────────────────────────────────────────

  const onKind = useCallback(async (grid: "parties" | "items", index: number, kind: string) => {
    const row = formRef.current[grid][index];
    if (!row || row.kind === kind) return;
    if (
      row.scopeId &&
      !(await confirm({
        title: "Change kind",
        message: `Row ${index + 1} already points at "${row.targetName}". Changing the kind clears it. Continue?`,
        confirmLabel: "Continue",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    if (grid === "parties") dispatch({ type: "partyKind", index, kind: kind as PromotionPartyKind });
    else dispatch({ type: "itemKind", index, kind: kind as PromotionItemKind });
  }, []);

  const openPicker = useCallback(
    (request: PickRequest) => {
      const current = formRef.current;
      let spec: PickerSpec | null = null;
      let heading = "";
      if (request.grid === "branches") {
        spec = BRANCH_PICKER;
        heading = "Branch";
      } else if (request.grid === "slabs") {
        spec = ITEM_PICKER;
        heading = "Free item";
      } else {
        // The row's Kind decides which master the Target picker searches.
        const kind = current[request.grid][request.index]?.kind ?? "";
        const scope = request.grid === "parties" ? findScope(PARTY_SCOPES, kind) : findScope(ITEM_SCOPES, kind);
        spec = scope;
        heading = scope?.label ?? "";
      }
      if (!spec) return;
      setPicker({ ...request, spec, gridId: resolveGrid(spec), heading });
    },
    [resolveGrid],
  );

  const closePicker = useCallback(() => {
    const open = picker;
    setPicker(null);
    if (open) setFocusRequest(cellFocusKey(open.grid, open.index, open.grid === "branches" ? "branch" : open.grid === "slabs" ? "freeItem" : "target"));
  }, [picker]);

  const onPicked = useCallback(
    (row: Record<string, unknown>) => {
      const open = picker;
      if (!open) return;
      const text = (key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]).trim());
      const id = text(open.spec.idKey);
      const name = text(open.spec.nameKey);
      setPicker(null);
      if (!id) return;
      if (open.grid === "branches") {
        dispatch({ type: "branchPicked", index: open.index, branchId: id, branchName: name });
        setFocusRequest(cellFocusKey("branches", open.index, "exclude"));
        return;
      }
      if (open.grid === "slabs") {
        dispatch({
          type: "slabFreeItem",
          index: open.index,
          itemId: id,
          itemName: name,
          unitId: text(ITEM_UNIT_ID_KEY),
          unitName: text(ITEM_UNIT_NAME_KEY),
        });
        setFocusRequest(cellFocusKey("slabs", open.index, "freeQty"));
        return;
      }
      // Re-resolve the kind now: if it changed while the picker was up, the id
      // would be written under the wrong master's key.
      const kind = formRef.current[open.grid][open.index]?.kind ?? "";
      const scope = open.grid === "parties" ? findScope(PARTY_SCOPES, kind) : findScope(ITEM_SCOPES, kind);
      if (!scope || scope.name !== open.spec.name) return;
      if (open.grid === "parties") {
        dispatch({ type: "partyPicked", index: open.index, scopeId: id, name });
        setFocusRequest(cellFocusKey("parties", open.index, "exclude"));
      } else {
        dispatch({
          type: "itemPicked",
          index: open.index,
          scopeId: id,
          name,
          unitId: text(ITEM_UNIT_ID_KEY),
          unitName: text(ITEM_UNIT_NAME_KEY),
        });
        setFocusRequest(cellFocusKey("items", open.index, kind === "ITEM" ? "unit" : "exclude"));
      }
    },
    [picker],
  );

  const removeFocusedRow = useCallback(async () => {
    if (tab === "scheme") return;
    const active = document.activeElement as HTMLElement | null;
    const rowElement = active?.closest<HTMLElement>(`tr[data-grid="${tab}"][data-row-index]`);
    if (!rowElement) return;
    const index = Number(rowElement.dataset.rowIndex);
    const list = formRef.current[tab as GridName];
    // The trailing blank row is the "type here to add" affordance, not data.
    if (!Number.isInteger(index) || index >= list.length - 1) return;
    if (!(await confirm({ title: "Remove row", message: `Remove row ${index + 1}?`, confirmLabel: "Remove", iconVariant: "delete" }))) {
      return;
    }
    dispatch({ type: "removeRow", grid: tab as GridName, index });
    setFocusRequest(cellFocusKey(tab as GridName, Math.max(0, index - 1), tab === "branches" ? "branch" : tab === "slabs" ? "exceeds" : "kind"));
  }, [tab]);

  // ── Save / close ────────────────────────────────────────────────────────

  const showProblem = useCallback((problem: SchemeProblem) => {
    setTab(problem.tab);
    if (problem.field) setFocusRequest(`field:${headerFieldId(problem.field)}`);
    else if (problem.row !== undefined && problem.column && problem.tab !== "scheme") {
      setFocusRequest(cellFocusKey(problem.tab, problem.row, problem.column));
    }
    toast.warn(problem.message, { title: problem.title });
  }, []);

  const submit = useCallback(async () => {
    if (savingRef.current || loading || !mayWrite) return;
    const current = formRef.current;
    const problem = validateScheme(current, (itemId) => units.get(itemId));
    if (problem) {
      showProblem(problem);
      return;
    }
    savingRef.current = true;
    try {
      // ex_prm_exclusive_clash and the code's uniqueness surface here, in words by code.
      await saveScheme(buildSavePayload(current, { userName: getUserInfo()?.userName ?? "" })).unwrap();
      dispatch({ type: "saved" });
      onSaved();
    } catch (error) {
      toast.apiError(error);
    } finally {
      savingRef.current = false;
    }
  }, [loading, mayWrite, onSaved, saveScheme, showProblem, units]);

  const close = useCallback(async () => {
    if (savingRef.current) return;
    if (
      formRef.current.dirty &&
      !(await confirm({
        title: "Discard changes",
        message: "This scheme has unsaved changes. Close anyway?",
        confirmLabel: "Close",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    onClose();
  }, [onClose]);

  // Esc: decided per EVENT — only when this popup is the topmost modal surface
  // and nothing above it (the picker, a confirm, a message) took the key.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (getConfirmations().length > 0 || getMessages().length > 0) return;
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals.length > 0 && modals[modals.length - 1] !== panelRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      void close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  // The page underneath does not scroll while the popup is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /** Enter-as-Tab over the visible tab's fields and cells, then Save. */
  const walkEnter = useCallback((target: EventTarget) => {
    if (!(target instanceof HTMLElement) || target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) return false;
    const panel = panelRef.current;
    if (!panel) return false;
    // A required box left empty keeps the caret.
    if (target instanceof HTMLInputElement && target.dataset.required === "true" && !target.value.trim()) return true;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>(WALK_SELECTOR)).filter(
      (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
    );
    const at = stops.indexOf(target);
    const next = at >= 0 ? stops[at + 1] : undefined;
    if (!next) return false;
    next.focus();
    if (next instanceof HTMLInputElement && next.type === "text") next.select();
    return true;
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      // Keys from the picker (a React child, portaled elsewhere) are its own.
      if (!panelRef.current?.contains(event.target as Node)) return;
      if (event.nativeEvent.defaultPrevented || getConfirmations().length > 0) return;
      const { key } = event;
      const ctrl = event.ctrlKey || event.metaKey;
      if (key === "Enter" && ctrl && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void submit();
        return;
      }
      if (ctrl && !event.altKey && (key === "Delete" || key === "-")) {
        event.preventDefault();
        void removeFocusedRow();
        return;
      }
      if (key === "Enter" && !ctrl && !event.altKey && !event.shiftKey) {
        if (walkEnter(event.target)) event.preventDefault();
        return;
      }
      // The list under the popup listens on the window for F1 / F2 / F3 / F5
      // and Alt+C / Alt+A; none of them belongs to it while this is up.
      if (/^F\d{1,2}$/.test(key) || (event.altKey && !ctrl && /^[ac]$/i.test(key))) event.preventDefault();
    },
    [removeFocusedRow, submit, walkEnter],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const tabEnabled = (id: SchemeTab) =>
    id === "branches" ? h.branchScope === "LIST" : id === "parties" ? h.custScope === "LIST" : true;
  // A tab turned off under the operator's feet hands the view back to Scheme.
  const shownTab = tabEnabled(tab) ? tab : "scheme";
  const subtitle = loading ? "Loading…" : editing ? `${h.code} · ${h.name}` : "New scheme";
  const pickerFallback: readonly PickerFallbackColumn[] = picker
    ? [{ field: picker.spec.nameKey, header: picker.heading || "Name" }]
    : [];

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <button type="button" className={styles.backdrop} aria-label="Close" tabIndex={-1} onMouseDown={() => void close()} />
        <section
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <header className={styles.panelHeader}>
            <span className={styles.panelIcon} aria-hidden="true">
              PS
            </span>
            <div className={styles.panelHeading}>
              <h2 id={titleId} className={styles.panelTitle}>
                Promotion Scheme
              </h2>
              <p className={styles.panelSubtitle}>{subtitle}</p>
            </div>
            <button type="button" className={styles.panelClose} aria-label="Close" tabIndex={-1} onClick={() => void close()}>
              ×
            </button>
          </header>

          <div className={styles.tabBar} role="tablist" aria-label="Promotion scheme">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={shownTab === entry.id}
                className={cx(styles.tab, shownTab === entry.id && styles.tabActive)}
                disabled={!tabEnabled(entry.id)}
                title={!tabEnabled(entry.id) ? "Set the scope to LIST on the Scheme tab to fill this" : undefined}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <form className={styles.panelBody} noValidate onSubmit={(event) => event.preventDefault()} aria-busy={loading}>
            <fieldset className={styles.bodyFieldset} disabled={loading}>
              {shownTab === "scheme" ? (
                <SchemeTabView header={h} dispatch={dispatch} onStatus={onStatus} onApplyOn={onApplyOn} onBenefit={(b) => void onBenefit(b)} />
              ) : (
                <div className={styles.gridPane}>
                  {shownTab !== "slabs" || benefitUsesBands(h.benefit) ? (
                    <h3 className={styles.sectionHeading}>
                      <span>{TABS.find((entry) => entry.id === shownTab)?.heading}</span>
                    </h3>
                  ) : null}
                  {shownTab === "branches" ? (
                    <BranchGrid rows={form.branches} disabled={h.branchScope !== "LIST"} dispatch={dispatch} onPick={openPicker} />
                  ) : null}
                  {shownTab === "parties" ? (
                    <PartyGrid
                      rows={form.parties}
                      disabled={h.custScope !== "LIST"}
                      onKind={(index, kind) => void onKind("parties", index, kind)}
                      dispatch={dispatch}
                      onPick={openPicker}
                    />
                  ) : null}
                  {shownTab === "items" ? (
                    <ItemGrid
                      rows={form.items}
                      benefit={h.benefit}
                      disabled={h.itemScope !== "LIST"}
                      unitsFor={unitsFor}
                      onKind={(index, kind) => void onKind("items", index, kind)}
                      dispatch={dispatch}
                      onPick={openPicker}
                    />
                  ) : null}
                  {shownTab === "slabs" ? (
                    <SlabGrid
                      rows={form.slabs}
                      benefit={h.benefit}
                      byAmount={h.applyOn.endsWith("_AMOUNT")}
                      unitsFor={unitsFor}
                      dispatch={dispatch}
                      onPick={openPicker}
                    />
                  ) : null}
                  <GridHelp grid={shownTab} />
                </div>
              )}
            </fieldset>
          </form>

          <footer className={styles.panelFooter}>
            <span className={styles.footerHint}>Enter next · Ctrl+Enter save · Ctrl+Del remove row · Esc close</span>
            <Button
              variant="primary"
              data-entry-save
              disabled={loading || saving || !mayWrite}
              title={mayWrite ? "Save (Ctrl+Enter)" : `No ${editing ? "edit" : "create"} right on Promotion Schemes`}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" tabIndex={-1} onClick={() => void close()}>
              Cancel
            </Button>
          </footer>
        </section>
      </div>
      {picker ? (
        <GridPickerModal
          isOpen
          columnHeading={picker.heading}
          gridId={picker.gridId}
          initialQuery={picker.initialQuery}
          searchPlaceholder="Type to search…"
          fallbackColumns={pickerFallback}
          rowKeyField={picker.spec.idKey}
          onClose={closePicker}
          onPick={onPicked}
        />
      ) : null}
    </ModalPortal>
  );
}
