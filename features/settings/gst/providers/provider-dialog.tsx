"use client";

/**
 * One GST provider (menu 269) — the Qt `GstProviderEntry`, built to
 * share/gst/gst_provider_ui_mockup.png.
 *
 *   Header   public.gst_provider                (/gst/providers/create | get)
 *   Tab 1    its services (grid 128, igpv_id) and the endpoints of the service
 *            picked (grid 129, igps_id); an endpoint opens with its field map
 *   Tab 2    its error map (grid 130, igpv_id)
 *   Right    the provider's own account per environment (/get → accounts[])
 *
 * Every child row saves on its own route from its own popup; Save here writes
 * the header only. A NEW provider shows the header alone until its first save
 * gives it an id, and stays open — the children are what a new provider is
 * for. + adds, − deletes, Enter edits, on every list.
 *
 * The configured grids answer a run from a one-second cache, so a list re-read
 * after a write waits that out (`GRID_CACHE_SETTLE_MS`), as the Qt screen did.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import {
  useDeleteGstPartMutation,
  useLoadGstProviderMutation,
  useRunGstGridMutation,
  useSaveGstProviderMutation,
} from "@/store/api/gstConfigApi";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import { ActivePill } from "../components/controls";
import { GstDialog } from "../components/gst-dialog";
import { GstTable } from "../components/gst-table";
import { PartDialog } from "../components/part-dialog";
import { fieldElementId } from "../components/part-fields";
import {
  ACCOUNT_FORM,
  ENDPOINT_FORM,
  ERROR_MAP_FORM,
  PROVIDER_FIELDS,
  SERVICE_FORM,
  type PartFormSpec,
} from "../domain/forms";
import { gstErrorText } from "../domain/format";
import {
  buildPartBody,
  camelRow,
  emptyPartState,
  fillPartState,
  setPartValue,
  validatePart,
  type PartField,
  type PartFormState,
} from "../domain/part-form";
import { GRID_CACHE_SETTLE_MS } from "../gst.constants";
import type { GstGridRow, GstProviderAccountPayload, GstProviderPayload } from "../gst.types";
import { ENDPOINT_COLUMNS, ERROR_MAP_COLUMNS, SERVICE_COLUMNS } from "./columns";
import { AccountsColumn } from "./accounts-column";
import { FieldMapPanel } from "./field-map-panel";
import styles from "../gst.module.scss";

type JsonRecord = Record<string, unknown>;

export type ProviderDialogProps = {
  /** null = a new provider. */
  gpvId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  /** The header was written: the list re-reads. */
  onSaved: () => void;
};

type Child =
  | { kind: "service"; row: JsonRecord | null }
  | { kind: "endpoint"; id: string | null }
  | { kind: "errorMap"; row: JsonRecord | null }
  | { kind: "account"; id: string | null };

type Tab = "services" | "errors";

const ID_PREFIX = "gst-provider";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const serviceKey = (row: GstGridRow) => text(row.gps_id);
const endpointKey = (row: GstGridRow) => text(row.gpe_id);
const errorKey = (row: GstGridRow) => text(row.gem_id);

function headerField(key: string): PartField {
  const field = PROVIDER_FIELDS.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(`No provider field ${key}`);
  }
  return field;
}

/** One list's rows, read through its grid; a write re-reads after the cache settles. */
function useGridRows(grid: ConfiguredGridKey, what: string) {
  const [runGrid] = useRunGstGridMutation();
  const [rows, setRows] = useState<GstGridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const load = useCallback(
    (params: Record<string, string> | null, afterWrite: boolean) => {
      const run = () => {
        const current = (generation.current += 1);
        if (!params) {
          setRows([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        runGrid({ grid, params })
          .unwrap()
          .then((result) => {
            if (current === generation.current) {
              setRows(result);
            }
          })
          .catch((error: unknown) => {
            if (current === generation.current) {
              toast.error(gstErrorText(error, `The ${what} could not be read.`));
            }
          })
          .finally(() => {
            if (current === generation.current) {
              setLoading(false);
            }
          });
      };
      if (afterWrite) {
        timers.current.push(window.setTimeout(run, GRID_CACHE_SETTLE_MS));
      } else {
        run();
      }
    },
    [grid, runGrid, what],
  );

  return { rows, loading, load, setRows };
}

export function ProviderDialog({ gpvId: initialId, canCreate, canEdit, canDelete, onClose, onSaved }: ProviderDialogProps) {
  const [gpvId, setGpvId] = useState<string | null>(initialId);
  // Read inside timers and after awaits, where the render's value is stale.
  const gpvIdRef = useRef<string | null>(initialId);
  const [header, setHeader] = useState<PartFormState>(() => emptyPartState(PROVIDER_FIELDS));
  const [payload, setPayload] = useState<GstProviderPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("services");
  const [pickedServiceId, setPickedServiceId] = useState<string | null>(null);
  const pickedServiceRef = useRef<string | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  const savingRef = useRef(false);

  const [loadProvider] = useLoadGstProviderMutation();
  const [saveProvider, { isLoading: saving }] = useSaveGstProviderMutation();
  const [deletePart] = useDeleteGstPartMutation();
  const services = useGridRows("gstProviderServices", "services");
  const endpoints = useGridRows("gstProviderEndpoints", "endpoints");
  const errorMap = useGridRows("gstProviderErrorMap", "error map");
  const { load: loadServices } = services;
  const { load: loadErrorMap } = errorMap;
  const { load: loadEndpoints, setRows: setEndpointRows } = endpoints;

  const isNew = !gpvId;
  const canWriteHeader = isNew ? canCreate : canEdit;

  // ── reads ─────────────────────────────────────────────────────────────────
  const providerGeneration = useRef(0);
  /** Re-read the provider: services[], accounts[] and the counts. The header
   *  is filled from the FIRST read only, so a child's save never undoes an
   *  edit the operator has not saved yet. */
  const refreshProvider = useCallback(
    (fillHeader = false) => {
      const id = gpvIdRef.current;
      if (!id) {
        return;
      }
      const current = (providerGeneration.current += 1);
      loadProvider(id)
        .unwrap()
        .then((result) => {
          if (current !== providerGeneration.current) {
            return;
          }
          setPayload(result);
          if (fillHeader) {
            setHeader(fillPartState(PROVIDER_FIELDS, result as unknown as JsonRecord));
          }
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (current !== providerGeneration.current) {
            return;
          }
          toast.error(gstErrorText(error, "The provider could not be read."));
          if (fillHeader) {
            onClose();
          }
        });
    },
    [loadProvider, onClose],
  );

  const reloadServices = useCallback(
    (afterWrite: boolean) => {
      const id = gpvIdRef.current;
      loadServices(id ? { igpv_id: id } : null, afterWrite);
    },
    [loadServices],
  );
  const reloadErrorMap = useCallback(
    (afterWrite: boolean) => {
      const id = gpvIdRef.current;
      loadErrorMap(id ? { igpv_id: id } : null, afterWrite);
    },
    [loadErrorMap],
  );
  const reloadEndpoints = useCallback(
    (afterWrite: boolean) => {
      const id = pickedServiceRef.current;
      loadEndpoints(id ? { igps_id: id } : null, afterWrite);
    },
    [loadEndpoints],
  );

  // Open: the provider and its two lists.
  useEffect(() => {
    if (!initialId) {
      return;
    }
    refreshProvider(true);
    reloadServices(false);
    reloadErrorMap(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a service picked while there are services; follow the pick with its endpoints.
  useEffect(() => {
    const rows = services.rows;
    setPickedServiceId((current) =>
      current && rows.some((row) => serviceKey(row) === current) ? current : rows[0] ? serviceKey(rows[0]) : null,
    );
  }, [services.rows]);

  useEffect(() => {
    pickedServiceRef.current = pickedServiceId;
    setEndpointRows([]);
    reloadEndpoints(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedServiceId]);

  const pickedService = services.rows.find((row) => serviceKey(row) === pickedServiceId) ?? null;
  const pickedLabel = pickedService
    ? `${text(pickedService.gps_service)} · ${text(pickedService.gps_environment)}`
    : "";
  const effectiveEndpointId = endpoints.rows.some((row) => endpointKey(row) === selectedEndpointId)
    ? selectedEndpointId
    : endpoints.rows[0]
      ? endpointKey(endpoints.rows[0])
      : null;
  const selectedEndpoint = endpoints.rows.find((row) => endpointKey(row) === effectiveEndpointId) ?? null;
  const effectiveErrorId = errorMap.rows.some((row) => errorKey(row) === selectedErrorId)
    ? selectedErrorId
    : errorMap.rows[0]
      ? errorKey(errorMap.rows[0])
      : null;
  const selectedError = errorMap.rows.find((row) => errorKey(row) === effectiveErrorId) ?? null;

  // ── the header ────────────────────────────────────────────────────────────
  const onHeaderValue = useCallback((key: string, value: string | boolean) => {
    setHeader((current) => setPartValue(current, key, value));
  }, []);

  const save = useCallback(async () => {
    const creating = !gpvIdRef.current;
    if (!(creating ? canCreate : canEdit) || loading || savingRef.current) {
      return;
    }
    const problem = validatePart(PROVIDER_FIELDS, header);
    if (problem) {
      setInvalidKey(problem.key);
      toast.warning(problem.message);
      document.getElementById(fieldElementId(ID_PREFIX, problem.key))?.focus();
      return;
    }
    setInvalidKey(null);
    savingRef.current = true;
    try {
      const data = await saveProvider(
        buildPartBody(PROVIDER_FIELDS, header, { idKey: "gpvId", id: gpvIdRef.current }),
      ).unwrap();
      onSaved();
      if (creating) {
        // Stay open: the services, error map and accounts come next.
        gpvIdRef.current = data.gpvId;
        setGpvId(data.gpvId);
        setPayload(data);
        setHeader(fillPartState(PROVIDER_FIELDS, data as unknown as JsonRecord));
        toast.success("Provider saved — now add its services, error map and accounts.");
        reloadServices(true);
        reloadErrorMap(true);
        return;
      }
      toast.success("Provider saved.");
      onClose();
    } catch (error) {
      toast.error(gstErrorText(error, "The provider could not be saved."));
    } finally {
      savingRef.current = false;
    }
  }, [canCreate, canEdit, header, loading, onClose, onSaved, reloadErrorMap, reloadServices, saveProvider]);

  // ── the children ──────────────────────────────────────────────────────────
  const closeChild = useCallback(() => setChild(null), []);

  const confirmDelete = useCallback(
    async (spec: PartFormSpec, id: string, what: string, note?: string): Promise<boolean> => {
      if (!canDelete || !id) {
        return false;
      }
      const ok = await confirm({ title: "Confirm Delete", message: `Delete ${what}?`, note, confirmLabel: "Delete" });
      if (!ok) {
        return false;
      }
      try {
        await deletePart({ url: spec.deleteUrl, body: { [spec.idKey]: id } }).unwrap();
        return true;
      } catch (error) {
        toast.error(gstErrorText(error, `Unable to delete ${what}.`));
        return false;
      }
    },
    [canDelete, deletePart],
  );

  const addService = useCallback(() => {
    if (canCreate && gpvIdRef.current) {
      setChild({ kind: "service", row: null });
    }
  }, [canCreate]);

  const editService = useCallback(
    (row: GstGridRow | null) => {
      if (!row) {
        return;
      }
      // The grid row is a summary; the provider's services[] carry the whole row.
      const full = payload?.services.find((service) => service.gpsId === serviceKey(row));
      if (!full) {
        toast.info("That service changed since the provider was read. It is being re-read — try again.");
        refreshProvider();
        return;
      }
      setChild({ kind: "service", row: full as unknown as JsonRecord });
    },
    [payload, refreshProvider],
  );

  const deleteService = useCallback(
    async (row: GstGridRow | null) => {
      if (!row) {
        return;
      }
      const label = `${text(row.gps_service)} · ${text(row.gps_environment)}`;
      if (await confirmDelete(SERVICE_FORM, serviceKey(row), `the ${label} service`, "Its endpoints and their field maps go with it.")) {
        reloadServices(true);
        refreshProvider();
      }
    },
    [confirmDelete, refreshProvider, reloadServices],
  );

  const addEndpoint = useCallback(() => {
    if (canCreate && pickedServiceRef.current) {
      setChild({ kind: "endpoint", id: null });
    }
  }, [canCreate]);

  const editEndpoint = useCallback((row: GstGridRow | null) => {
    if (row && pickedServiceRef.current) {
      setChild({ kind: "endpoint", id: endpointKey(row) });
    }
  }, []);

  const deleteEndpoint = useCallback(
    async (row: GstGridRow | null) => {
      if (!row) {
        return;
      }
      if (await confirmDelete(ENDPOINT_FORM, endpointKey(row), `the ${text(row.gpe_action)} endpoint`, "Its field map goes with it.")) {
        reloadEndpoints(true);
        reloadServices(true);
        refreshProvider();
      }
    },
    [confirmDelete, refreshProvider, reloadEndpoints, reloadServices],
  );

  const addErrorMap = useCallback(() => {
    if (canCreate && gpvIdRef.current) {
      setChild({ kind: "errorMap", row: null });
    }
  }, [canCreate]);

  const editErrorMap = useCallback((row: GstGridRow | null) => {
    if (!row) {
      return;
    }
    const camel = camelRow(row);
    // The grid shows "(all)" for a NULL service; the form's "" item is that.
    if (camel.gemService === "(all)") {
      camel.gemService = "";
    }
    setChild({ kind: "errorMap", row: camel });
  }, []);

  const deleteErrorMap = useCallback(
    async (row: GstGridRow | null) => {
      if (!row) {
        return;
      }
      if (await confirmDelete(ERROR_MAP_FORM, errorKey(row), `the error map row ${text(row.gem_their_code)}`)) {
        reloadErrorMap(true);
        refreshProvider();
      }
    },
    [confirmDelete, refreshProvider, reloadErrorMap],
  );

  const addAccount = useCallback(() => {
    if (canCreate && gpvIdRef.current) {
      setChild({ kind: "account", id: null });
    }
  }, [canCreate]);

  const deleteAccount = useCallback(
    async (account: GstProviderAccountPayload) => {
      if (await confirmDelete(ACCOUNT_FORM, account.gpaId, `the ${account.gpaEnvironment} account`)) {
        refreshProvider();
      }
    },
    [confirmDelete, refreshProvider],
  );

  // ── render ────────────────────────────────────────────────────────────────
  const keys = useMemo(() => [{ key: "F5", run: () => void save() }], [save]);
  const active = header.values.gpvIsActive === true;
  const name = typeof header.values.gpvName === "string" ? header.values.gpvName : "";
  const code = typeof header.values.gpvCode === "string" ? header.values.gpvCode.toUpperCase() : "";

  const input = (key: string, extraClass?: string) => {
    const field = headerField(key);
    const value = header.values[key];
    const placeholder = "placeholder" in field ? field.placeholder : undefined;
    const locked = key === "gpvCode" && !isNew;
    return (
      <input
        id={fieldElementId(ID_PREFIX, key)}
        className={cx(styles.input, invalidKey === key && styles.inputInvalid, extraClass)}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        maxLength={field.kind === "text" ? field.maxLength : undefined}
        inputMode={field.kind === "int" ? "numeric" : undefined}
        readOnly={locked || !canWriteHeader}
        title={locked ? "The code every endpoint is filed under; it never changes." : undefined}
        autoFocus={key === "gpvCode" && isNew}
        data-uppercase="off"
        spellCheck={false}
        onChange={(event) => onHeaderValue(key, event.target.value)}
      />
    );
  };
  const label = (key: string, required?: boolean) => (
    <label className={styles.label} htmlFor={fieldElementId(ID_PREFIX, key)}>
      {headerField(key).label}
      {required ? <span className={styles.requiredMark}>*</span> : null}
    </label>
  );

  return (
    <GstDialog
      title="GST Provider"
      subtitle={isNew ? "New provider" : name}
      badge={isNew ? null : <ActivePill active={active} upper />}
      width={92}
      tall
      fixedBody
      keys={keys}
      onClose={onClose}
      footer={
        <>
          <span className={styles.keys}>
            F5 Save  ·  Esc Close  ·  + / − add or delete a row  ·  Enter edits it  ·  Enter on an endpoint opens its
            field map
          </span>
          <button type="button" className={styles.button} onClick={onClose}>
            {canWriteHeader ? "Cancel" : "Close"}
          </button>
          {canWriteHeader ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <>
          <div className={styles.caption}>Provider</div>
          <div className={styles.providerHeader}>
            {label("gpvCode", true)}
            {input("gpvCode")}
            {label("gpvName", true)}
            {input("gpvName")}
            {label("gpvPortalUrl")}
            {input("gpvPortalUrl")}
            <label className={styles.check} aria-disabled={!canWriteHeader || undefined}>
              <input
                id={fieldElementId(ID_PREFIX, "gpvIsActive")}
                type="checkbox"
                checked={active}
                disabled={!canWriteHeader}
                onChange={(event) => onHeaderValue("gpvIsActive", event.target.checked)}
              />
              Active
            </label>
            {label("gpvTimeoutMs")}
            {input("gpvTimeoutMs")}
            {label("gpvMaxRetries")}
            {input("gpvMaxRetries")}
            {label("gpvRateLimitPerMin")}
            {input("gpvRateLimitPerMin")}
            <span className={styles.hint}>Timeout and retries are defaults; a service or endpoint may override them.</span>
            {label("gpvSupportEmail")}
            {input("gpvSupportEmail")}
            {label("gpvSupportPhone")}
            {input("gpvSupportPhone")}
            {label("gpvRemarks")}
            <div className={styles.spanRest}>{input("gpvRemarks")}</div>
          </div>

          {isNew ? (
            <div className={styles.noteWarn}>
              Save the provider first — its services, endpoints, error map and accounts are added once it exists.
              {code ? ` It will be filed as ${code}; a code never changes once saved.` : ""}
            </div>
          ) : null}

          <div className={styles.split}>
            <div className={cx(styles.splitPane, isNew && styles.splitPaneDisabled)}>
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "services"}
                  className={cx(styles.tab, tab === "services" && styles.tabActive)}
                  onClick={() => setTab("services")}
                >
                  Services &amp; endpoints
                  <span className={styles.tabCount}>{payload?.endpointCount ?? ""}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "errors"}
                  className={cx(styles.tab, tab === "errors" && styles.tabActive)}
                  onClick={() => setTab("errors")}
                >
                  Error map
                  <span className={styles.tabCount}>{payload?.errorMapCount ?? ""}</span>
                </button>
              </div>

              {tab === "services" ? (
                <div className={styles.tabPane}>
                  <div className={styles.listBar}>
                    <div className={styles.caption}>
                      Services <span className={styles.captionNote}>· one row per service × environment</span>
                    </div>
                    <button type="button" className={cx(styles.button, styles.buttonSmall)} disabled={!canCreate} onClick={addService}>
                      + Add service
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!pickedService}
                      onClick={() => editService(pickedService)}
                    >
                      {canEdit ? "Edit" : "View"}
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!pickedService || !canDelete}
                      onClick={() => void deleteService(pickedService)}
                    >
                      − Delete
                    </button>
                  </div>
                  <GstTable
                    columns={SERVICE_COLUMNS}
                    rows={services.rows}
                    rowKey={serviceKey}
                    selectedKey={pickedServiceId}
                    onSelect={setPickedServiceId}
                    onActivate={editService}
                    onAdd={canCreate ? addService : undefined}
                    onDelete={canDelete ? (row) => void deleteService(row) : undefined}
                    loading={services.loading}
                    emptyText="No service yet. + adds the first."
                    ariaLabel="Services"
                    className={styles.tableHalf}
                  />
                  <p className={styles.hint}>
                    + / − add or remove a row  ·  Enter edits it  ·  {services.rows.length} rows  ·  the fallback hosts
                    sit on the row&apos;s Fallback URLs field
                  </p>

                  <div className={styles.listBar}>
                    <div className={styles.caption}>
                      {pickedService ? (
                        <>
                          Endpoints of {pickedLabel}
                          <span className={styles.captionNote}>· Enter opens the field map</span>
                        </>
                      ) : (
                        <>
                          Endpoints <span className={styles.captionNote}>· pick a service above</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!canCreate || !pickedService}
                      onClick={addEndpoint}
                    >
                      + Add endpoint
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!selectedEndpoint}
                      onClick={() => editEndpoint(selectedEndpoint)}
                    >
                      {canEdit ? "Edit / field map" : "View / field map"}
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!selectedEndpoint || !canDelete}
                      onClick={() => void deleteEndpoint(selectedEndpoint)}
                    >
                      − Delete
                    </button>
                  </div>
                  <GstTable
                    columns={ENDPOINT_COLUMNS}
                    rows={endpoints.rows}
                    rowKey={endpointKey}
                    selectedKey={effectiveEndpointId}
                    onSelect={setSelectedEndpointId}
                    onActivate={editEndpoint}
                    onAdd={canCreate && pickedService ? addEndpoint : undefined}
                    onDelete={canDelete ? (row) => void deleteEndpoint(row) : undefined}
                    loading={endpoints.loading}
                    emptyText={pickedService ? "No endpoint yet." : "Pick a service above."}
                    ariaLabel="Endpoints"
                    className={styles.tableHalf}
                  />
                  <p className={styles.hint}>
                    A path still /CONFIRM-PATH has not been confirmed with the provider; that endpoint cannot work until
                    it is.
                  </p>
                </div>
              ) : (
                <div className={styles.tabPane}>
                  <div className={styles.listBar}>
                    <div className={styles.caption}>
                      Error map <span className={styles.captionNote}>· their code → our code, retry, re-auth</span>
                    </div>
                    <button type="button" className={cx(styles.button, styles.buttonSmall)} disabled={!canCreate} onClick={addErrorMap}>
                      + Add
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!selectedError}
                      onClick={() => editErrorMap(selectedError)}
                    >
                      {canEdit ? "Edit" : "View"}
                    </button>
                    <button
                      type="button"
                      className={cx(styles.button, styles.buttonSmall)}
                      disabled={!selectedError || !canDelete}
                      onClick={() => void deleteErrorMap(selectedError)}
                    >
                      − Delete
                    </button>
                  </div>
                  <GstTable
                    columns={ERROR_MAP_COLUMNS}
                    rows={errorMap.rows}
                    rowKey={errorKey}
                    selectedKey={effectiveErrorId}
                    onSelect={setSelectedErrorId}
                    onActivate={editErrorMap}
                    onAdd={canCreate ? addErrorMap : undefined}
                    onDelete={canDelete ? (row) => void deleteErrorMap(row) : undefined}
                    loading={errorMap.loading}
                    emptyText="No error map yet."
                    ariaLabel="Error map"
                  />
                  <p className={styles.hint}>
                    «Treat as SUCCESS» rows (NIC 2150 / 2172, EWB 312) read the existing IRN or e-way bill number out of
                    the error reply. Without them a retry after a lost reply makes a duplicate.
                  </p>
                </div>
              )}
            </div>

            <AccountsColumn
              accounts={payload?.accounts ?? []}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              disabled={isNew}
              onAdd={addAccount}
              onOpen={(account) => setChild({ kind: "account", id: account.gpaId })}
              onDelete={(account) => void deleteAccount(account)}
            />
          </div>
        </>
      )}

      {child?.kind === "service" && gpvId ? (
        <PartDialog
          spec={SERVICE_FORM}
          parentId={gpvId}
          row={child.row}
          readOnly={child.row ? !canEdit : false}
          context={code}
          onClose={closeChild}
          onSaved={(data) => {
            if (data.gpsId) {
              setPickedServiceId(String(data.gpsId));
            }
            reloadServices(true);
            refreshProvider();
          }}
        />
      ) : null}
      {child?.kind === "endpoint" && pickedServiceId ? (
        <PartDialog
          spec={ENDPOINT_FORM}
          parentId={pickedServiceId}
          id={child.id}
          readOnly={child.id ? !canEdit : false}
          stayOpenOnCreate
          context={`${code} · ${pickedLabel}`}
          onClose={closeChild}
          onSaved={(data) => {
            if (data.gpeId) {
              setSelectedEndpointId(String(data.gpeId));
            }
            reloadEndpoints(true);
            reloadServices(true);
            refreshProvider();
          }}
          renderCustom={(field, ctx) =>
            field.key === "fieldMaps" ? (
              <FieldMapPanel
                gpeId={ctx.id}
                rows={Array.isArray(ctx.data?.fieldMaps) ? (ctx.data.fieldMaps as JsonRecord[]) : []}
                canCreate={canCreate && !ctx.readOnly}
                canEdit={canEdit}
                canDelete={canDelete && !ctx.readOnly}
                onChanged={() => {
                  ctx.reload();
                  reloadEndpoints(true);
                }}
              />
            ) : null
          }
        />
      ) : null}
      {child?.kind === "errorMap" && gpvId ? (
        <PartDialog
          spec={ERROR_MAP_FORM}
          parentId={gpvId}
          row={child.row}
          partialRow={Boolean(child.row)}
          readOnly={child.row ? !canEdit : false}
          context={code}
          onClose={closeChild}
          onSaved={(data) => {
            if (data.gemId) {
              setSelectedErrorId(String(data.gemId));
            }
            reloadErrorMap(true);
            refreshProvider();
          }}
        />
      ) : null}
      {child?.kind === "account" && gpvId ? (
        <PartDialog
          spec={ACCOUNT_FORM}
          parentId={gpvId}
          id={child.id}
          readOnly={child.id ? !canEdit : false}
          context={code}
          onClose={closeChild}
          onSaved={() => refreshProvider()}
        />
      ) : null}
    </GstDialog>
  );
}
