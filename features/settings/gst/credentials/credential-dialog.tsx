"use client";

/**
 * One taxpayer portal login (menu 270) — the Qt `GstCredentialEntry`, built
 * to share/gst/gst_credential_ui_mockup.png. `/gst/company-credentials/*`.
 *
 * Grain: company + branch + service + environment + priority. The GSTIN is
 * never typed: the server resolves it (the branch's GSTIN, else the
 * company's) and answers it on every read, shown read-only. Service blank =
 * one login for every service the provider sells (the gateway case).
 *
 * Secrets are write-only: the password is required on create and can be
 * replaced, never cleared; client id / secret / app key can be cleared.
 *
 * Verify (F7) = ONE sign-in at the portal through the server's lease. It
 * saves first if anything changed (a new login included). NIC blocks a GSTIN
 * after 5 sign-ins in 15 minutes, so the button greys for 60 s after a press.
 * It needs Post on menu 270. The session panel reads /status — no portal call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import {
  useLoadGstCredentialMutation,
  useLoadGstCredentialStatusMutation,
  useSaveGstCredentialMutation,
  useVerifyGstCredentialMutation,
} from "@/store/api/gstConfigApi";
import { EnvironmentPill, IpChips, Pill } from "../components/controls";
import { GstDialog } from "../components/gst-dialog";
import { fieldElementId, PartFields } from "../components/part-fields";
import { CREDENTIAL_FIELDS } from "../domain/forms";
import {
  formatStamp,
  gstErrorCode,
  gstErrorText,
  gstFirstErrorMessage,
  todayIsoDate,
} from "../domain/format";
import {
  buildPartBody,
  emptyPartState,
  fillPartState,
  setPartValue,
  setSecretText,
  toggleSecretClear,
  validatePart,
  type PartField,
  type PartFormState,
} from "../domain/part-form";
import { GST_SWITCHED_OFF, VERIFY_COOLDOWN_MS } from "../gst.constants";
import type { GstCompanyCredentialPayload, GstCredentialStatus } from "../gst.types";
import styles from "../gst.module.scss";

export type CredentialDialogProps = {
  /** null = a new login. */
  gccId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  /** Post on menu 270 runs Verify — it reaches an outside system. */
  canPost: boolean;
  onClose: () => void;
  /** A save landed: the list re-reads. */
  onSaved: () => void;
};

type VerifyOutcome = { ok: boolean; text: string; detail?: string };

const ID_PREFIX = "gst-credential";

function pick(key: string): PartField {
  const field = CREDENTIAL_FIELDS.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(`No credential field ${key}`);
  }
  return field;
}

// The form in the mockup's three blocks. Custom entries are drawn here and
// add nothing to the body; the body is always built from CREDENTIAL_FIELDS.
const WHO_FIELDS: readonly PartField[] = [
  pick("gccCompanyId"),
  { kind: "custom", key: "gstin", label: "GSTIN" },
  pick("gccBranchId"),
  { kind: "custom", key: "gstinNote", label: "" },
  pick("gccGpvId"),
  pick("gccService"),
  pick("gccEnvironment"),
  pick("gccPriority"),
  pick("gccIsActive"),
];
const LOGIN_FIELDS: readonly PartField[] = [
  pick("gccLoginId"),
  pick("password"),
  pick("clientId"),
  pick("clientSecret"),
  pick("appKey"),
  { kind: "custom", key: "passwordChanged", label: "Changed" },
  pick("gccPublicKeyRef"),
];
const LIMIT_FIELDS: readonly PartField[] = [
  pick("gccValidFrom"),
  pick("gccValidUpto"),
  { kind: "custom", key: "gccWhitelistedIps", label: "Whitelisted IPs", full: true },
  { ...pick("gccRemarks"), full: true },
];

function fillFromPayload(data: GstCompanyCredentialPayload): PartFormState {
  const state = fillPartState(CREDENTIAL_FIELDS, data as unknown as Record<string, unknown>);
  return {
    ...state,
    labels: {
      ...state.labels,
      gccGpvId: data.gpvCode ? `${data.gpvCode} — ${data.gpvName}` : data.gpvName,
    },
  };
}

function newCredentialState(): PartFormState {
  return setPartValue(emptyPartState(CREDENTIAL_FIELDS), "gccValidFrom", todayIsoDate());
}

function SessionPanel({ status }: { status: GstCredentialStatus | null }) {
  const balance =
    status?.creditBalance === null || status?.creditBalance === undefined
      ? "—"
      : Math.round(status.creditBalance).toLocaleString("en-IN");
  return (
    <dl className={styles.sessionGrid}>
      <dt>Live token</dt>
      <dd>{status ? (status.hasLiveToken ? `yes — expires ${formatStamp(status.tokenExpiresOn)}` : "no") : "—"}</dd>
      <dt>Issued</dt>
      <dd>{formatStamp(status?.issuedOn)}</dd>
      <dt>Lease</dt>
      <dd>
        {status
          ? status.leaseFree
            ? "free (no counter is signing in now)"
            : "held — a counter is signing in"
          : "—"}
      </dd>
      <dt>Last verified</dt>
      <dd>{formatStamp(status?.lastVerifiedOn)}</dd>
      <dt>Last error</dt>
      <dd>{status?.lastErrorMessage || "—"}</dd>
      <dt>Credit balance</dt>
      <dd>{balance}</dd>
    </dl>
  );
}

export function CredentialDialog({
  gccId: initialId,
  canCreate,
  canEdit,
  canPost,
  onClose,
  onSaved,
}: CredentialDialogProps) {
  const [gccId, setGccId] = useState<string | null>(initialId);
  const gccIdRef = useRef<string | null>(initialId);
  const [state, setState] = useState<PartFormState>(() => newCredentialState());
  const [payload, setPayload] = useState<GstCompanyCredentialPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [dirty, setDirty] = useState(!initialId);
  /** Company or branch changed since the server last resolved the GSTIN. */
  const [gstinStale, setGstinStale] = useState(false);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [status, setStatus] = useState<GstCredentialStatus | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [coolingSeconds, setCoolingSeconds] = useState(0);
  const busyRef = useRef(false);

  const [loadCredential] = useLoadGstCredentialMutation();
  const [loadStatus] = useLoadGstCredentialStatusMutation();
  const [saveCredential, { isLoading: saving }] = useSaveGstCredentialMutation();
  const [verifyCredential] = useVerifyGstCredentialMutation();

  const companyDropdownId = useDropdownId("company");
  const branchDropdownId = useDropdownId("branchByCompany");
  const providerDropdownId = useDropdownId("gstProvider");

  const isNew = !gccId;
  const canWrite = isNew ? canCreate : canEdit;
  const readOnly = !canWrite;

  const refreshStatus = useCallback(
    (id: string) => {
      loadStatus(id)
        .unwrap()
        .then(setStatus)
        // The panel keeps its dashes; the status is a courtesy, not the record.
        .catch(() => undefined);
    },
    [loadStatus],
  );

  useEffect(() => {
    if (!initialId) {
      return;
    }
    let cancelled = false;
    loadCredential(initialId)
      .unwrap()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setPayload(data);
        setState(fillFromPayload(data));
        setDirty(false);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        toast.error(gstErrorText(error, "The credential could not be read."));
        onClose();
      });
    refreshStatus(initialId);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 60 s after a Verify press, counted down on the button.
  useEffect(() => {
    if (coolingSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCoolingSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [coolingSeconds]);

  // ── edits ─────────────────────────────────────────────────────────────────
  const change = useCallback((next: (current: PartFormState) => PartFormState) => {
    setState(next);
    setDirty(true);
  }, []);
  const onValue = useCallback(
    (key: string, value: string | boolean) => change((current) => setPartValue(current, key, value)),
    [change],
  );
  const onSecretText = useCallback(
    (key: string, text: string) => change((current) => setSecretText(current, key, text)),
    [change],
  );
  const onSecretClear = useCallback(
    (key: string) => change((current) => toggleSecretClear(current, key)),
    [change],
  );

  // ── save ──────────────────────────────────────────────────────────────────
  /** Writes the form; answers the saved row, or null after saying why not. */
  const persist = useCallback(async (): Promise<GstCompanyCredentialPayload | null> => {
    const creating = !gccIdRef.current;
    if (!(creating ? canCreate : canEdit)) {
      toast.warning(`Your login may not ${creating ? "create" : "change"} GST credentials.`);
      return null;
    }
    const problem = validatePart(CREDENTIAL_FIELDS, state);
    if (problem) {
      setInvalidKey(problem.key);
      toast.warning(problem.message);
      document.getElementById(fieldElementId(ID_PREFIX, problem.key))?.focus();
      return null;
    }
    setInvalidKey(null);
    try {
      const data = await saveCredential(
        buildPartBody(CREDENTIAL_FIELDS, state, { idKey: "gccId", id: gccIdRef.current }),
      ).unwrap();
      onSaved();
      gccIdRef.current = data.gccId;
      setGccId(data.gccId);
      setPayload(data);
      setState(fillFromPayload(data));
      setGstinStale(false);
      setDirty(false);
      return data;
    } catch (error) {
      toast.error(gstErrorText(error, "The credential could not be saved."));
      return null;
    }
  }, [canCreate, canEdit, onSaved, saveCredential, state]);

  const save = useCallback(async () => {
    if (readOnly || loading || busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      if (await persist()) {
        toast.success("GST credential saved.");
        onClose();
      }
    } finally {
      busyRef.current = false;
    }
  }, [loading, onClose, persist, readOnly]);

  // ── verify ────────────────────────────────────────────────────────────────
  const verifyDisabledReason = !canPost
    ? "Your login may not run Verify (GST Credentials: Post)."
    : coolingSeconds > 0
      ? `NIC allows 5 sign-ins in 15 minutes — wait ${coolingSeconds} s.`
      : isNew && !canCreate
        ? "Save the credential first."
        : "";

  const verify = useCallback(async () => {
    if (verifyDisabledReason || loading || busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      let id = gccIdRef.current;
      // Saves first if anything changed, then signs in once.
      if (!id || dirty) {
        const saved = await persist();
        if (!saved) {
          return;
        }
        id = saved.gccId;
      }
      setCoolingSeconds(Math.round(VERIFY_COOLDOWN_MS / 1000));
      setVerifying(true);
      try {
        const result = await verifyCredential(id).unwrap();
        const code = result.errorCode ? `  (${result.errorCode})` : "";
        const details = [
          result.tokenValidUntil ? `token valid until ${formatStamp(result.tokenValidUntil)}` : "",
          result.creditBalance !== null && result.creditBalance !== undefined
            ? `credit balance ${Math.round(result.creditBalance).toLocaleString("en-IN")}`
            : "",
        ].filter(Boolean);
        setOutcome({
          ok: result.ok,
          text: `${result.ok ? "✓" : "×"}  ${result.message}${code}`,
          detail: details.join("  ·  ") || undefined,
        });
      } catch (error) {
        // 503 GST_SWITCHED_OFF names the inactive row ("GST provider CHARTERED
        // is inactive"); nothing went out to the portal.
        const text =
          gstErrorCode(error) === GST_SWITCHED_OFF
            ? `Switched off: ${gstFirstErrorMessage(error)}`
            : gstErrorText(error, "Verify could not run.");
        setOutcome({ ok: false, text: `×  ${text}` });
      } finally {
        setVerifying(false);
      }
      refreshStatus(id);
    } finally {
      busyRef.current = false;
    }
  }, [dirty, loading, persist, refreshStatus, verifyCredential, verifyDisabledReason]);

  // ── the dropdowns ─────────────────────────────────────────────────────────
  const companyId = typeof state.values.gccCompanyId === "string" ? state.values.gccCompanyId : "";
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);

  const renderCustom = (field: PartField) => {
    const id = fieldElementId(ID_PREFIX, field.key);
    const value = state.values[field.key];
    const selection =
      typeof value === "string" && value ? { id: value, text: state.labels[field.key] ?? "" } : null;
    switch (field.key) {
      case "gccCompanyId":
        return (
          <NexDropdownSingle
            id={id}
            dropdownId={companyDropdownId}
            value={selection}
            readOnly={readOnly}
            invalid={invalidKey === field.key}
            onChange={(picked) => {
              setGstinStale(true);
              change((current) => {
                // A branch belongs to one company: a new company drops the old branch.
                const next = setPartValue(current, "gccCompanyId", picked?.id ?? "", picked?.text ?? "");
                return picked?.id === current.values.gccCompanyId ? next : setPartValue(next, "gccBranchId", "", "");
              });
            }}
          />
        );
      case "gccBranchId":
        return (
          <NexDropdownSingle
            id={id}
            dropdownId={branchDropdownId}
            value={selection}
            // Its SQL tests a QUOTED 'ibr_comp_id' — "" is every company, and
            // the token must be sent even then.
            params={branchParams}
            keepEmptyParams={["ibr_comp_id"]}
            clearOnParamsChange={false}
            placeholder="(all branches — use the company GSTIN)"
            readOnly={readOnly}
            onChange={(picked) => {
              setGstinStale(true);
              change((current) => setPartValue(current, "gccBranchId", picked?.id ?? "", picked?.text ?? ""));
            }}
          />
        );
      case "gccGpvId":
        return (
          <NexDropdownSingle
            id={id}
            dropdownId={providerDropdownId}
            value={selection}
            readOnly={readOnly}
            invalid={invalidKey === field.key}
            onChange={(picked) =>
              change((current) => setPartValue(current, "gccGpvId", picked?.id ?? "", picked?.text ?? ""))
            }
          />
        );
      case "gstin":
        return (
          <input
            id={id}
            className={styles.input}
            readOnly
            tabIndex={-1}
            value={gstinStale ? "" : (payload?.gstin ?? "")}
            placeholder="resolved from the company / branch on save"
          />
        );
      case "passwordChanged":
        return (
          <input
            id={id}
            className={styles.input}
            readOnly
            tabIndex={-1}
            value={payload?.gccPasswordChangedOn ? `${formatStamp(payload.gccPasswordChangedOn).slice(0, 10)} (password)` : ""}
            placeholder="—"
          />
        );
      case "gccWhitelistedIps":
        return (
          <IpChips
            id={id}
            value={typeof value === "string" ? value : ""}
            disabled={readOnly}
            onChange={(next) => onValue("gccWhitelistedIps", next)}
          />
        );
      default:
        return null;
    }
  };

  const environment = typeof state.values.gccEnvironment === "string" ? state.values.gccEnvironment : "";
  const service = typeof state.values.gccService === "string" ? state.values.gccService : "";
  const companyLabel = state.labels.gccCompanyId ?? "";
  const subtitle = isNew
    ? "New login  ·  the taxpayer's portal login. Secrets are write-only."
    : [companyLabel, service || "all services", environment].filter(Boolean).join("  ·  ");

  const keys = useMemo(
    () => [
      { key: "F5", run: () => void save() },
      { key: "F7", run: () => void verify() },
    ],
    [save, verify],
  );

  const fieldsProps = {
    state,
    idPrefix: ID_PREFIX,
    readOnly,
    invalidKey,
    onValue,
    onSecretText,
    onSecretClear,
    renderCustom,
  };

  return (
    <GstDialog
      title="GST Credential"
      subtitle={subtitle}
      badge={
        <>
          {payload?.isExpired ? <Pill tone="red">EXPIRED</Pill> : null}
          <EnvironmentPill environment={environment} />
        </>
      }
      width={84}
      keys={keys}
      onClose={onClose}
      footer={
        <>
          <span className={styles.keys}>
            F5 Save  ·  F7 Verify  ·  Esc Close  ·  a secret box left empty keeps the stored value
          </span>
          <button type="button" className={styles.button} onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {readOnly ? null : (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <div className={styles.credentialSplit}>
          <div className={styles.column}>
            <div className={styles.heading}>
              Who <span className={styles.headingNote}>· the GSTIN is read from the company / branch, never typed</span>
            </div>
            <PartFields {...fieldsProps} fields={WHO_FIELDS} />
            <div className={styles.heading}>
              Portal login <span className={styles.headingNote}>· write-only: a stored value is never shown or sent back</span>
            </div>
            <PartFields {...fieldsProps} fields={LOGIN_FIELDS} />
            <div className={styles.heading}>Limits</div>
            <PartFields {...fieldsProps} fields={LIMIT_FIELDS} />
          </div>

          <div className={styles.column}>
            <div className={styles.heading}>
              Verify <span className={styles.headingNote}>· one AUTH call to the portal, nothing else</span>
            </div>
            <div className={styles.verifyRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={Boolean(verifyDisabledReason) || verifying || saving}
                title={verifyDisabledReason || undefined}
                onClick={() => void verify()}
              >
                {verifying ? "Signing in…" : coolingSeconds > 0 ? `Verify again in ${coolingSeconds} s` : "Verify now  F7"}
              </button>
              <span className={styles.hint}>
                {canPost ? "Saves first if anything changed, then signs in once." : verifyDisabledReason}
              </span>
            </div>
            {outcome ? (
              <div className={outcome.ok ? styles.resultOk : styles.resultFail} role="status">
                <div>{outcome.text}</div>
                {outcome.detail ? <div>{outcome.detail}</div> : null}
              </div>
            ) : null}
            <div className={styles.heading}>
              Session <span className={styles.headingNote}>· gst_auth_session, read-only</span>
            </div>
            <SessionPanel status={status} />
            <div className={styles.noteWarn}>
              NIC blocks a GSTIN after 5 sign-ins in 15 minutes. Verify is one sign-in; the screen greys it for 60 s
              after a press, and the server&apos;s lease stops four tills signing in at once. Never verify in a loop to
              «test» a login. Service blank = one login for e-invoice AND e-way (the gateway case).
            </div>
          </div>
        </div>
      )}
    </GstDialog>
  );
}
