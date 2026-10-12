"use client";

/**
 * Statement format… — Qt SettlementFormatDialog: a tender's statement column
 * map (`tnd_statement_format`). GET format reads it, Save posts it (validated
 * in full: SETTLEMENT_FORMAT_INVALID lists every problem, shown here, not in a
 * popup), Clear map posts null. "Test on a sample file…" runs the SAVED map
 * over a file (format/test, multipart) — nothing is written — and says so when
 * the form differs from what was saved. CSV only for now.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { confirm } from "@/lib/confirm";
import type { SettlementClient } from "../api/settlement-api";
import { settlementErrorDetails, settlementErrorMessage } from "../domain/errors";
import {
  DATE_FORMAT_PLACEHOLDER,
  FORMAT_FIELDS,
  FORMAT_KINDS,
  FORMAT_SOURCES,
  emptyFormatForm,
  formFromFormat,
  formatFromForm,
  formatTestSummary,
  sameFormat,
  savedMapOf,
  settlesText,
  terminalText,
  type FormatForm,
} from "../domain/format-map";
import { STATEMENT_FILE_ACCEPT, testFields } from "../domain/import-read";
import type { FormatPayload, StatementFormat } from "../domain/types";
import { useSettlementTenders } from "../hooks/use-tenders";
import { SettlementDialog } from "./settlement-dialog";
import styles from "../page.module.scss";

export function FormatDialog({
  client,
  companyId,
  canEdit,
  onClose,
}: {
  client: SettlementClient;
  companyId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { tenders, loading: tendersLoading } = useSettlementTenders(client, companyId);
  const [chosenTender, setChosenTender] = useState("");
  const tenderId = chosenTender || tenders[0]?.id || "";
  const [payload, setPayload] = useState<FormatPayload | null>(null);
  const [form, setForm] = useState<FormatForm>(emptyFormatForm);
  const [saved, setSaved] = useState<StatementFormat | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [testLine, setTestLine] = useState<{ text: string; ok: boolean | null }>({ text: "", ok: null });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const showFormat = useCallback((next: FormatPayload) => {
    setPayload(next);
    setForm(formFromFormat(next.format));
    setSaved(savedMapOf(next));
    setProblems([]);
    setTestLine({ text: next.format ? "" : "No map yet for this tender.", ok: null });
  }, []);

  useEffect(() => {
    if (!tenderId || !companyId) return;
    let live = true;
    client
      .getFormat(companyId, tenderId)
      .then((next) => {
        if (live) showFormat(next);
      })
      .catch((failure: unknown) => {
        if (live) setProblems([settlementErrorMessage(failure)]);
      });
    return () => {
      live = false;
    };
  }, [client, companyId, showFormat, tenderId]);

  const save = async (clear: boolean) => {
    if (!tenderId || busy) return;
    setBusy(true);
    try {
      showFormat(await client.saveFormat(companyId, tenderId, clear ? null : formatFromForm(form)));
      setTestLine({ text: clear ? "Map cleared." : "Saved — test it on a sample file.", ok: true });
    } catch (failure) {
      // SETTLEMENT_FORMAT_INVALID lists every problem: show them here, not in a box.
      const details = settlementErrorDetails(failure);
      setProblems(details.length > 0 ? details : [settlementErrorMessage(failure)]);
    } finally {
      setBusy(false);
    }
  };

  const clearMap = async () => {
    const yes = await confirm({
      title: "Clear map",
      message: "Remove this tender's column map? Its files can no longer be imported until a map is saved again.",
      confirmLabel: "Clear map",
      cancelLabel: "Cancel",
    });
    if (yes) await save(true);
  };

  const testFile = async (file: File) => {
    // The test reads the SAVED map: say so when the form differs from it.
    if (
      !sameFormat(formatFromForm(form), saved) &&
      !(await confirm({
        title: "Test on a sample file",
        message:
          "The map has changes that are not saved — the test reads the saved map. Test the saved one anyway?",
        confirmLabel: "Test the saved map",
        cancelLabel: "Cancel",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await client.testFormat(testFields(companyId, tenderId), file, file.name);
      const summary = formatTestSummary(result);
      setTestLine({ text: summary.summary, ok: summary.ok });
      setProblems(summary.problems);
    } catch (failure) {
      setProblems([settlementErrorMessage(failure)]);
    } finally {
      setBusy(false);
    }
  };

  const setColumn = (key: string, value: string) =>
    setForm((current) => ({ ...current, columns: { ...current.columns, [key]: value } }));
  const setKind = (kind: string, value: string) =>
    setForm((current) => ({ ...current, kinds: { ...current.kinds, [kind]: value } }));

  const editable = canEdit && !busy && tenderId !== "";

  return (
    <SettlementDialog
      title="Statement format"
      subtitle="The provider's file layout, kept on the tender — one map per format; terminals of one MID share it. Only gross is required; the time is needed for the amount + time suggestion."
      size="wide"
      rawText
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <span className={styles.muted}>A provider changing its file = edit this map; no code change. CSV only for now.</span>
          <span className={styles.spacer} />
          <button type="button" className={styles.button} disabled={!editable || !saved} onClick={() => void clearMap()}>
            Clear map
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!editable}
            title={canEdit ? undefined : "Needs the EDIT right on Settlement Reconciliation"}
            onClick={() => void save(false)}
          >
            Save
          </button>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
            Close
          </button>
        </>
      }
    >
      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="settlement-format-tender">
          Tender
        </label>
        <select
          id="settlement-format-tender"
          className={styles.select}
          value={tenderId}
          disabled={busy || tenders.length === 0}
          autoFocus
          onChange={(event) => setChosenTender(event.target.value)}
        >
          {tenders.length === 0 ? (
            <option value="">{tendersLoading ? "Loading…" : "No card / UPI / wallet / bank tender"}</option>
          ) : null}
          {tenders.map((tender) => (
            <option key={tender.id} value={tender.id}>
              {tender.name}
            </option>
          ))}
        </select>
        <span className={styles.formLabel}>Terminal · VPA</span>
        <span>{terminalText(payload)}</span>
        <span className={styles.formLabel}>Settles to</span>
        <span className={payload && !payload.settlementLedgerId ? styles.badText : undefined}>{settlesText(payload)}</span>
        <label className={styles.formLabel} htmlFor="settlement-format-provider">
          Provider
        </label>
        <input
          id="settlement-format-provider"
          className={styles.input}
          value={form.provider}
          maxLength={60}
          disabled={!editable}
          onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
        />
        <label className={styles.formLabel} htmlFor="settlement-format-source">
          Source
        </label>
        <select
          id="settlement-format-source"
          className={styles.select}
          value={form.source}
          disabled={!editable}
          onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
        >
          {FORMAT_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <label className={styles.formLabel} htmlFor="settlement-format-date">
          Date format
        </label>
        <div className={styles.inline}>
          <input
            id="settlement-format-date"
            className={styles.input}
            value={form.dateFormat}
            placeholder={DATE_FORMAT_PLACEHOLDER}
            disabled={!editable}
            onChange={(event) => setForm((current) => ({ ...current, dateFormat: event.target.value }))}
          />
          <label className={styles.radio}>
            <input
              type="checkbox"
              checked={form.negativeIsRefund}
              disabled={!editable}
              onChange={(event) => setForm((current) => ({ ...current, negativeIsRefund: event.target.checked }))}
            />
            a negative amount is a refund
          </label>
        </div>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.sectionCap}>Statement format</span>
        <span className={styles.muted}>tnd_statement_format (jsonb) — our field ← the file&apos;s column header</span>
      </div>
      <div className={styles.mapColumns}>
        <table className={styles.mapTable}>
          <thead>
            <tr>
              <th scope="col">Our field</th>
              <th scope="col">File column (header)</th>
            </tr>
          </thead>
          <tbody>
            {FORMAT_FIELDS.map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td>
                  <input
                    className={styles.input}
                    value={form.columns[field.key] ?? ""}
                    disabled={!editable}
                    aria-label={`File column for ${field.label}`}
                    onChange={(event) => setColumn(field.key, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className={styles.mapTable}>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">The provider&apos;s words (comma-separated)</th>
            </tr>
          </thead>
          <tbody>
            {FORMAT_KINDS.map((kind) => (
              <tr key={kind}>
                <td>{kind}</td>
                <td>
                  <input
                    className={styles.input}
                    value={form.kinds[kind] ?? ""}
                    disabled={!editable}
                    aria-label={`The provider's words for ${kind}`}
                    onChange={(event) => setKind(kind, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.button}
          disabled={busy || !tenderId}
          onClick={() => fileRef.current?.click()}
        >
          Test on a sample file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={STATEMENT_FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void testFile(file);
          }}
        />
        <span className={testLine.ok === true ? styles.okText : testLine.ok === false ? styles.badText : styles.muted}>
          {busy ? "Working…" : testLine.text}
        </span>
      </div>
      {problems.length > 0 ? <p className={styles.problems}>{problems.join("\n")}</p> : null}
    </SettlementDialog>
  );
}
