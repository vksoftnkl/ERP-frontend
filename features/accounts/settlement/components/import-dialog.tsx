"use client";

/**
 * Import file… — Qt SettlementImportDialog, "Import settlement file".
 *
 * Read first, write nothing: Read file sends the file through the tender's
 * column map (format/test, nothing saved) and shows what it says — rows,
 * payouts, gross / fee / GST / net — and every problem. Only a clean read
 * enables "Import and match" (import, multipart), which writes one import per
 * payout and matches at once; the server refuses the same file twice, another
 * store's terminal and a tender with no map or no settlement ledger, each with
 * its code.
 */
import { DateInput } from "@/components/design-system/ui/date-input";
import { useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import type { SettlementClient } from "../api/settlement-api";
import { istToday } from "../domain/dates";
import { settlementErrorCode, settlementErrorMessage } from "../domain/errors";
import {
  STATEMENT_FILE_ACCEPT,
  STATEMENT_MAX_BYTES,
  formatStateText,
  importEnabled,
  importFields,
  readRefusedText,
  readSummary,
  testFields,
  type ReadSummary,
} from "../domain/import-read";
import { tenderLabel } from "../domain/tenders";
import type { Payout } from "../domain/types";
import { useSettlementTenders } from "../hooks/use-tenders";
import { SettlementDialog } from "./settlement-dialog";
import styles from "../page.module.scss";

function checkClass(line: string): string | undefined {
  if (line.startsWith("✓")) return styles.checkOk;
  if (line.startsWith("!")) return styles.checkWarn;
  if (line.startsWith("✗")) return styles.checkBad;
  return styles.checkMuted;
}

export function ImportDialog({
  client,
  companyId,
  branchId,
  onClose,
  onImported,
}: {
  client: SettlementClient;
  companyId: string;
  branchId: string;
  onClose: () => void;
  /** The first payout written. */
  onImported: (first: Payout | null) => void;
}) {
  const { tenders, loading: tendersLoading } = useSettlementTenders(client, companyId);
  const [chosenTender, setChosenTender] = useState("");
  const tenderId = chosenTender || tenders[0]?.id || "";
  const tender = tenders.find((entry) => entry.id === tenderId) ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ReadSummary | null>(null);
  const [checks, setChecks] = useState<string[]>([]);
  const [readOk, setReadOk] = useState(false);
  const [fileHasDate, setFileHasDate] = useState(true);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutDateOn, setPayoutDateOn] = useState(false);
  const [payoutDate, setPayoutDate] = useState(istToday);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const forget = () => {
    setReadOk(false);
    setSummary(null);
    setChecks([]);
  };

  const choose = (next: File) => {
    if (next.size > STATEMENT_MAX_BYTES) {
      toast.warning(`The file is over ${STATEMENT_MAX_BYTES / 1024 / 1024} MB: split it`);
      return;
    }
    setFile(next);
    forget();
  };

  const read = async () => {
    if (!file || !tender || busy) return;
    setBusy(true);
    try {
      const result = await client.testFormat(testFields(companyId, tender.id), file, file.name);
      const next = readSummary(result);
      setSummary(next);
      setChecks(next.checks);
      setReadOk(next.readOk);
      setFileHasDate(next.fileHasDate);
      // The import refuses a payout with no date: ask for it here.
      if (!next.fileHasDate) setPayoutDateOn(true);
    } catch (failure) {
      setReadOk(false);
      setSummary(null);
      setChecks([readRefusedText(settlementErrorCode(failure), settlementErrorMessage(failure))]);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file || !tender || !importEnabled({ busy, readOk, fileHasDate, payoutDateOn })) return;
    setBusy(true);
    try {
      const imports = await client.importFile(
        importFields({ companyId, tenderId: tender.id, branchId, payoutRef, payoutDateOn, payoutDate, notes }),
        file,
        file.name,
      );
      const count = imports.length;
      toast.success(`${count} payout(s) imported`);
      onImported(imports[0] ?? null);
    } catch (failure) {
      toast.error(settlementErrorMessage(failure));
      setBusy(false);
    }
  };

  const canImport = importEnabled({ busy, readOk, fileHasDate, payoutDateOn });
  const says = summary;

  return (
    <SettlementDialog
      title="Import settlement file"
      subtitle="The provider's file, read with the tender's column map — checked before anything is written."
      size="wide"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button type="button" className={styles.primaryButton} disabled={!canImport} onClick={() => void doImport()}>
            {busy && readOk ? "Importing…" : "Import and match"}
          </button>
          <button type="button" className={styles.button} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <span className={styles.muted}>one import per payout · match runs straight after</span>
        </>
      }
    >
      <div className={styles.formGrid}>
        <span className={styles.formLabel}>File</span>
        <div className={styles.inline}>
          <input
            className={styles.input}
            value={file?.name ?? ""}
            readOnly
            placeholder="a provider's statement, CSV"
            aria-label="File"
            data-uppercase="off"
          />
          <button type="button" className={styles.button} disabled={busy} autoFocus onClick={() => fileRef.current?.click()}>
            Browse…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={STATEMENT_FILE_ACCEPT}
            hidden
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (next) choose(next);
            }}
          />
        </div>
        <label className={styles.formLabel} htmlFor="settlement-import-tender">
          Tender / terminal
        </label>
        <select
          id="settlement-import-tender"
          className={styles.select}
          value={tenderId}
          disabled={busy || tenders.length === 0}
          onChange={(event) => {
            setChosenTender(event.target.value);
            forget();
          }}
        >
          {tenders.length === 0 ? (
            <option value="">{tendersLoading ? "Loading…" : "No card / UPI / wallet / bank tender"}</option>
          ) : null}
          {tenders.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {tenderLabel(entry)}
            </option>
          ))}
        </select>
        <span className={styles.formLabel}>Format</span>
        <span className={tender && !tender.settlementLedgerId ? styles.badText : undefined}>
          {formatStateText(tender)}
        </span>
        <label className={styles.formLabel} htmlFor="settlement-import-ref">
          Payout ref
        </label>
        <input
          id="settlement-import-ref"
          className={styles.input}
          value={payoutRef}
          maxLength={60}
          disabled={busy}
          data-uppercase="off"
          placeholder="the bank UTR, when the file has no payout column"
          onChange={(event) => setPayoutRef(event.target.value)}
        />
        <span className={styles.formLabel}>Payout date</span>
        <div className={styles.inline}>
          <input
            type="checkbox"
            checked={payoutDateOn}
            disabled={busy}
            aria-label="Give the payout date"
            onChange={(event) => setPayoutDateOn(event.target.checked)}
          />
          <DateInput
            className={styles.input}
            style={{ width: "auto" }}
            value={payoutDate}
            disabled={busy || !payoutDateOn}
            aria-label="Payout date"
            onChange={(value) => setPayoutDate(value)}
          />
          <span className={styles.muted}>only when the file has no payout column</span>
        </div>
        <label className={styles.formLabel} htmlFor="settlement-import-notes">
          Notes
        </label>
        <input
          id="settlement-import-notes"
          className={styles.input}
          value={notes}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className={styles.toolbar}>
        <span className={styles.sectionCap}>What the file says</span>
        <span className={styles.muted}>read, nothing saved yet</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.button} disabled={busy || !file || !tender} onClick={() => void read()}>
          {busy && !readOk ? "Reading…" : "Read file"}
        </button>
      </div>
      <div className={styles.saysGrid}>
        {(
          [
            ["Rows read", says?.rows],
            ["Payouts", says?.payouts],
            ["Payout UTR", says?.utr],
            ["Date", says?.date],
            ["Gross", says?.gross],
            ["Fee", says?.fee],
            ["GST on fee", says?.tax],
            ["Net", says?.net],
          ] as const
        ).map(([caption, value]) => (
          <div key={caption} className={styles.fact}>
            <span className={styles.factCap}>{caption}</span>
            <span className={cx(styles.factValue, caption === "Net" && styles.factNet)}>{value || "—"}</span>
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <span className={styles.sectionCap}>Checks</span>
        <span className={styles.muted}>before anything is written</span>
      </div>
      <ul className={styles.checks} aria-live="polite">
        {checks.length === 0 ? (
          <li className={styles.checkMuted}>Browse… a file, then Read file.</li>
        ) : (
          checks.map((line, index) => (
            <li key={index} className={checkClass(line)}>
              {line}
            </li>
          ))
        )}
      </ul>
    </SettlementDialog>
  );
}
