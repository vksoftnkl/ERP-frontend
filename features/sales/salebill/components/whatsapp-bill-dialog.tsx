"use client";

/**
 * Send the bill on WhatsApp — click-to-chat, the operator presses Send.
 *
 * The dialog renders the SAVED bill to a PDF (the design the Print dialog would
 * pick — see `useDocumentPdf`), offers the customer's numbers best first, and
 * with one click saves the PDF and opens WhatsApp on that customer's chat with
 * the message typed. The operator attaches the file and sends it. Nothing goes
 * out by itself: there is no WhatsApp Business account behind this.
 *
 * Where the phone or tablet can share files (`navigator.canShare`), "Share PDF…"
 * hands the file itself to the share sheet — WhatsApp then attaches it, but the
 * operator picks the contact there, because a share sheet cannot be told one.
 *
 * Mounted only while open, so every open starts from the bill as it is now.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { Field } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { useDocumentPdf } from "@/features/printing/hooks/useDocumentPdf";
import { useGetBillCustomerContactsQuery } from "@/store/api/saleBillApi";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import {
  NO_CUSTOMER_CONTACTS,
  WHATSAPP_OPEN_WITH_OPTIONS,
  buildBillWhatsappMessage,
  formatWhatsappNumber,
  isWhatsappOpenWith,
  normalizeWhatsappNumber,
  whatsappCandidates,
  whatsappChatUrl,
  whatsappPdfFilename,
  type WhatsappBillTarget,
  type WhatsappOpenWith,
} from "../salebill.whatsapp";
import styles from "../page.module.scss";

/** Per browser: a counter with the desktop app installed always wants the app. */
const OPEN_WITH_STORAGE_KEY = "erp.whatsapp.openWith";
/** One WhatsApp Web tab, reused for every bill rather than a new tab per send. */
const WHATSAPP_WEB_WINDOW = "erp-whatsapp";

const NUMBER_ID = "salebill-whatsapp-number";
const MESSAGE_ID = "salebill-whatsapp-message";

function readOpenWith(): WhatsappOpenWith {
  try {
    const stored = window.localStorage.getItem(OPEN_WITH_STORAGE_KEY);
    return isWhatsappOpenWith(stored) ? stored : "web";
  } catch {
    return "web";
  }
}

function saveFile(objectUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Open the chat. Must run inside the click: `window.open` after an await is a
 * popup the browser blocks. Returns false when it was blocked anyway.
 */
function openChat(url: string, openWith: WhatsappOpenWith): boolean {
  if (openWith === "app") {
    // A custom scheme: an anchor hands it to the OS without leaving the page.
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
  const opened = window.open(url, WHATSAPP_WEB_WINDOW);
  if (!opened) {
    return false;
  }
  opened.opener = null;
  return true;
}

type Sent = { number: string; chatUrl: string; filename: string; blocked: boolean };

export function WhatsappBillDialog({ target, onClose }: { target: WhatsappBillTarget; onClose: () => void }) {
  const { docKey } = target;
  const filename = `${whatsappPdfFilename(target.billRefno, docKey.sbId)}.pdf`;

  const pdf = useDocumentPdf({
    purposeCode: PURPOSE_CODE.SALE_INVOICE,
    outputMode: "WHATSAPP",
    target: {
      docId: docKey.sbId,
      companyId: docKey.sbCompanyId,
      accYear: docKey.sbAccYear,
      filename: whatsappPdfFilename(target.billRefno, docKey.sbId),
    },
  });

  const contacts = useGetBillCustomerContactsQuery(target.custId ?? "", { skip: !target.custId });
  const contactsSettled = !target.custId || !contacts.isLoading;
  const candidates = useMemo(
    () =>
      whatsappCandidates({
        ...(contacts.currentData ?? NO_CUSTOMER_CONTACTS),
        billPhone: target.billPhone,
        contactNo: target.contactNo,
      }),
    [contacts.currentData, target.billPhone, target.contactNo],
  );

  /** What the operator typed; null until they do, so the best number fills in once it is known. */
  const [typedNumber, setTypedNumber] = useState<string | null>(null);
  const numberText =
    typedNumber ?? (contactsSettled && candidates[0] ? formatWhatsappNumber(candidates[0].number) : "");
  const number = normalizeWhatsappNumber(numberText);

  const business = useAppSelector(selectBusinessContext);
  const [message, setMessage] = useState(() =>
    buildBillWhatsappMessage({
      customerName: target.customerName,
      billRefno: target.billRefno,
      billDate: target.billDate,
      amount: target.amount,
      // The header's name only when the header IS the bill's company.
      companyName: business?.companyId === docKey.sbCompanyId ? business?.companyName : null,
    }),
  );

  const [openWith, setOpenWith] = useState<WhatsappOpenWith>(readOpenWith);
  const changeOpenWith = (next: WhatsappOpenWith) => {
    setOpenWith(next);
    try {
      window.localStorage.setItem(OPEN_WITH_STORAGE_KEY, next);
    } catch {
      // Private mode: the choice lasts for this dialog only.
    }
  };

  const [sent, setSent] = useState<Sent | null>(null);

  const canShareFile = useMemo(() => {
    if (!pdf.file || typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
      return false;
    }
    try {
      return navigator.canShare({ files: [pdf.file] });
    } catch {
      return false;
    }
  }, [pdf.file]);

  const ready = pdf.status === "ready" && pdf.objectUrl !== null;
  const blockedReason = !ready
    ? (pdf.message ?? "Rendering the PDF…")
    : !number
      ? "Enter the customer's WhatsApp number."
      : null;

  const send = () => {
    if (!ready || !pdf.objectUrl) {
      return;
    }
    if (!number) {
      toast.warn(
        numberText.trim()
          ? `${numberText.trim()} is not a mobile number WhatsApp can open.`
          : "Enter the customer's WhatsApp number.",
      );
      document.getElementById(NUMBER_ID)?.focus();
      return;
    }
    // The file first, then the chat — both inside this click, or the chat is
    // a popup the browser blocks.
    saveFile(pdf.objectUrl, filename);
    const chatUrl = whatsappChatUrl(number, message, openWith);
    const opened = openChat(chatUrl, openWith);
    pdf.recordFile();
    setSent({ number, chatUrl, filename, blocked: !opened });
  };

  const share = async () => {
    if (!pdf.file) {
      return;
    }
    try {
      await navigator.share({ files: [pdf.file], text: message, title: `Bill ${target.billRefno}`.trim() });
      pdf.recordFile();
      onClose();
    } catch (thrown) {
      // Dismissing the share sheet is a change of mind, not a failure.
      if ((thrown as { name?: string } | null)?.name === "AbortError") {
        return;
      }
      toast.error(thrown instanceof Error && thrown.message ? thrown.message : "The PDF could not be shared.");
    }
  };

  const onNumberKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      send();
    }
  };
  const onMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Plain Enter is a new line in a message; Ctrl+Enter sends.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  };

  const title = target.billRefno ? `WhatsApp — Bill ${target.billRefno}` : "WhatsApp — Bill";

  if (sent) {
    return (
      <ModalShell
        title={title}
        isOpen
        narrow
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              className={quotationStyles.button}
              onClick={() => pdf.objectUrl && saveFile(pdf.objectUrl, sent.filename)}
              disabled={!pdf.objectUrl}
            >
              Save PDF again
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              onClick={() => setSent({ ...sent, blocked: !openChat(sent.chatUrl, openWith) })}
            >
              Open chat again
            </button>
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              autoFocus
              onClick={onClose}
            >
              Done
            </button>
          </>
        }
      >
        <div className={styles.whatsappSent}>
          {sent.blocked ? (
            <p className={styles.whatsappStatusError}>
              The browser blocked WhatsApp from opening. Allow pop-ups for this site, or press
              &ldquo;Open chat again&rdquo;.
            </p>
          ) : (
            <p className={styles.whatsappLead}>
              WhatsApp is opening on <strong>{formatWhatsappNumber(sent.number)}</strong> with the message
              typed in.
            </p>
          )}
          <ol className={styles.whatsappSteps}>
            <li>
              <strong>{sent.filename}</strong> has been saved to your Downloads.
            </li>
            <li>
              In the chat, click <strong>📎 Attach → Document</strong> and choose it — or drag it from the
              browser&rsquo;s downloads into the chat.
            </li>
            <li>
              Press <strong>Send</strong>.
            </li>
          </ol>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={title}
      isOpen
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel
          </button>
          {canShareFile ? (
            <button
              type="button"
              className={quotationStyles.button}
              disabled={!ready}
              title="Hand the PDF to this device's share sheet — choose WhatsApp and the contact there"
              onClick={() => void share()}
            >
              Share PDF…
            </button>
          ) : null}
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={blockedReason !== null}
            title={blockedReason ?? "Save the PDF and open the customer's WhatsApp chat (Enter)"}
            onClick={send}
          >
            Send on WhatsApp
          </button>
        </>
      }
    >
      <div className={quotationStyles.fieldGrid}>
        <Field label="To" htmlFor={NUMBER_ID} required>
          <input
            id={NUMBER_ID}
            className={quotationStyles.input}
            value={numberText}
            inputMode="tel"
            autoComplete="off"
            placeholder={contactsSettled ? "Customer's WhatsApp number" : "Looking up the customer…"}
            maxLength={20}
            data-uppercase="off"
            autoFocus
            onChange={(event) => setTypedNumber(event.target.value)}
            onKeyDown={onNumberKeyDown}
          />
        </Field>
        <span />
        <div className={styles.whatsappNumberNote}>
          {numberText.trim() && !number ? (
            <span className={styles.whatsappStatusError}>Not a mobile number WhatsApp can open.</span>
          ) : contactsSettled && candidates.length === 0 && !numberText.trim() ? (
            <span className={quotationStyles.modalNote}>
              This customer has no WhatsApp number or mobile on file — type one. Filling in the
              customer&rsquo;s WhatsApp No. on the Customer master saves typing it next time.
            </span>
          ) : null}
          {candidates.length > 1 ? (
            <span className={styles.whatsappChips}>
              {candidates.map((candidate) => (
                <button
                  key={candidate.number}
                  type="button"
                  className={cx(styles.whatsappChip, candidate.number === number && styles.whatsappChipActive)}
                  title={`Use the ${candidate.label.toLowerCase()}`}
                  onClick={() => setTypedNumber(formatWhatsappNumber(candidate.number))}
                >
                  {candidate.label} · {formatWhatsappNumber(candidate.number)}
                </button>
              ))}
            </span>
          ) : null}
        </div>

        <Field label="Message" htmlFor={MESSAGE_ID}>
          <textarea
            id={MESSAGE_ID}
            className={cx(quotationStyles.textarea, styles.whatsappMessage)}
            value={message}
            rows={7}
            data-uppercase="off"
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onMessageKeyDown}
          />
        </Field>

        <Field label="Open in">
          <span className={styles.whatsappOpenWith} role="radiogroup" aria-label="Open in">
            {WHATSAPP_OPEN_WITH_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="salebill-whatsapp-open-with"
                  value={option.value}
                  checked={openWith === option.value}
                  onChange={() => changeOpenWith(option.value)}
                />
                {option.label}
              </label>
            ))}
          </span>
        </Field>

        <Field label="PDF">
          <span className={styles.whatsappPdfStatus}>
            {pdf.status === "ready" ? (
              <span>
                <strong>{filename}</strong>
                {pdf.pageCount ? ` · ${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"}` : ""} — ready
              </span>
            ) : pdf.status === "error" ? (
              <>
                <span className={styles.whatsappStatusError}>{pdf.message}</span>
                <button type="button" className={quotationStyles.button} onClick={pdf.retry}>
                  Try again
                </button>
              </>
            ) : (
              <span className={quotationStyles.modalNote}>{pdf.message}</span>
            )}
          </span>
        </Field>
      </div>
    </ModalShell>
  );
}
