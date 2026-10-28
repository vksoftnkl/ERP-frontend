"use client";

/**
 * Send the bill on WhatsApp — click-to-chat, the operator presses Send.
 *
 * The dialog renders the SAVED bill to a PDF (the design the Print dialog would
 * pick — see `useDocumentPdf`), asks the server for a public link to that very
 * render (`/print-share/create`), and puts the link in the message. Send opens
 * WhatsApp on the customer's chat with the message typed; the operator presses
 * Send there and the customer taps the link to open the bill. Nothing goes out
 * by itself: there is no WhatsApp Business account behind this.
 *
 * A chat link carries text only — no web page can make WhatsApp attach a file —
 * which is why the PDF travels as a link. If the link cannot be had (a server
 * without `/print-share`), the dialog falls back to saving the PDF for the
 * operator to attach by hand, and says so before they press anything.
 *
 * Where the phone or tablet can share files (`navigator.canShare`), "Share PDF…"
 * hands the file itself to the share sheet — WhatsApp then attaches it, but the
 * operator picks the contact there, because a share sheet cannot be told one.
 *
 * Mounted only while open, so every open starts from the bill as it is now.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "@/lib/notify";
import { API_BASE } from "@/lib/api/client";
import { getApiErrorMessage } from "@/store/api";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { Field } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { useDocumentPdf } from "@/features/printing/hooks/useDocumentPdf";
import { shareLinkUrl, useCreatePrintShareLinkMutation } from "@/features/printing/api/share";
import { useGetBillCustomerContactsQuery } from "@/store/api/saleBillApi";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import {
  NO_CUSTOMER_CONTACTS,
  WHATSAPP_OPEN_WITH_OPTIONS,
  buildBillWhatsappMessage,
  formatLinkExpiry,
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
/** What the message's link line reads while the link is being made (the box is locked meanwhile). */
const LINK_PENDING = "(preparing the link…)";

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

/** The server's answer to "a link to this render", once it has given one. */
type LinkAnswer = { url: string; expiresAt: string } | { error: string };

type Sent = {
  number: string;
  chatUrl: string;
  blocked: boolean;
  /** Null when the PDF was saved for attaching by hand instead. */
  link: { url: string; expiresAt: string } | null;
};

export function WhatsappBillDialog({ target, onClose }: { target: WhatsappBillTarget; onClose: () => void }) {
  const { docKey } = target;
  const fileStem = whatsappPdfFilename(target.billRefno, docKey.sbId);
  const filename = `${fileStem}.pdf`;

  const pdf = useDocumentPdf({
    purposeCode: PURPOSE_CODE.SALE_INVOICE,
    outputMode: "WHATSAPP",
    target: {
      docId: docKey.sbId,
      companyId: docKey.sbCompanyId,
      accYear: docKey.sbAccYear,
      filename: fileStem,
    },
  });

  /*
   * The link, asked for ONCE per render — as soon as the PDF is in hand, so the
   * message already carries it when the operator reads it. It is the same
   * revision and scope the preview just drew, which is why the PDF comes first:
   * a link is never handed out for a render that did not work.
   */
  const [createLink] = useCreatePrintShareLinkMutation();
  const [linkAnswer, setLinkAnswer] = useState<LinkAnswer | null>(null);
  const linkRequestedFor = useRef<string | null>(null);
  const source = pdf.source;
  const sourceKey = source ? `${source.versionId}::${source.docId}` : null;
  useEffect(() => {
    if (!source || !sourceKey || linkRequestedFor.current === sourceKey) {
      return;
    }
    linkRequestedFor.current = sourceKey;
    void createLink({ ...source, filename: fileStem })
      .unwrap()
      .then((created) =>
        setLinkAnswer({
          url: shareLinkUrl(created, API_BASE, window.location.origin),
          expiresAt: created.expiresAt,
        }),
      )
      .catch((thrown: unknown) =>
        setLinkAnswer({ error: getApiErrorMessage(thrown as never) ?? "The link could not be created." }),
      );
  }, [createLink, fileStem, source, sourceKey]);
  const retryLink = () => {
    linkRequestedFor.current = null;
    setLinkAnswer(null);
  };

  const link = linkAnswer && "url" in linkAnswer ? linkAnswer : null;
  const linkError = linkAnswer && "error" in linkAnswer ? linkAnswer.error : null;
  /** Fell back: the PDF is saved and attached by hand, the message says "attached". */
  const attachInstead = linkError !== null;
  const pdfReady = pdf.status === "ready" && pdf.objectUrl !== null;
  const linkSettled = link !== null || attachInstead;

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

  /*
   * The message: generated until the operator edits it, and generated WITH the
   * link once there is one. The box is locked until the link settles, so an
   * edit can never be made against a message that is about to change under it.
   */
  const business = useAppSelector(selectBusinessContext);
  const [typedMessage, setTypedMessage] = useState<string | null>(null);
  const message =
    typedMessage ??
    buildBillWhatsappMessage({
      customerName: target.customerName,
      billRefno: target.billRefno,
      billDate: target.billDate,
      amount: target.amount,
      // The header's name only when the header IS the bill's company.
      companyName: business?.companyId === docKey.sbCompanyId ? business?.companyName : null,
      link: link ? link.url : attachInstead ? null : LINK_PENDING,
    });
  const linkDroppedFromMessage = link !== null && !message.includes(link.url);

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

  const blockedReason = !pdfReady
    ? (pdf.message ?? "Rendering the PDF…")
    : !linkSettled
      ? "Preparing the link to the bill…"
      : !number
        ? "Enter the customer's WhatsApp number."
        : null;

  const send = () => {
    if (!pdfReady || !pdf.objectUrl || !linkSettled) {
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
    // Inside this click, both of them, or the chat is a popup the browser blocks.
    if (attachInstead) {
      saveFile(pdf.objectUrl, filename);
    }
    const chatUrl = whatsappChatUrl(number, message, openWith);
    const opened = openChat(chatUrl, openWith);
    pdf.recordFile();
    setSent({ number, chatUrl, blocked: !opened, link });
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

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("The link could not be copied — select it and copy it by hand.");
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
    const sentLink = sent.link;
    return (
      <ModalShell
        title={title}
        isOpen
        narrow
        onClose={onClose}
        footer={
          <>
            {sentLink ? (
              <button type="button" className={quotationStyles.button} onClick={() => void copyLink(sentLink.url)}>
                Copy link
              </button>
            ) : (
              <button
                type="button"
                className={quotationStyles.button}
                onClick={() => pdf.objectUrl && saveFile(pdf.objectUrl, filename)}
                disabled={!pdf.objectUrl}
              >
                Save PDF again
              </button>
            )}
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
          ) : sentLink ? (
            <p className={styles.whatsappLead}>
              WhatsApp is opening on <strong>{formatWhatsappNumber(sent.number)}</strong> with the message and
              the link to the bill typed in — press <strong>Send</strong> there.
            </p>
          ) : (
            <p className={styles.whatsappLead}>
              WhatsApp is opening on <strong>{formatWhatsappNumber(sent.number)}</strong> with the message
              typed in.
            </p>
          )}
          {sentLink ? (
            <p className={quotationStyles.modalNote}>
              The customer taps the link to open the bill&rsquo;s PDF. It works until{" "}
              <strong>{formatLinkExpiry(sentLink.expiresAt)}</strong>.
            </p>
          ) : (
            <ol className={styles.whatsappSteps}>
              <li>
                <strong>{filename}</strong> has been saved to your Downloads.
              </li>
              <li>
                In the chat, click <strong>📎 Attach → Document</strong> and choose it — or drag it from the
                browser&rsquo;s downloads into the chat.
              </li>
              <li>
                Press <strong>Send</strong>.
              </li>
            </ol>
          )}
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
              disabled={!pdfReady}
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
            title={blockedReason ?? "Open the customer's WhatsApp chat with this message (Enter)"}
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
            rows={8}
            data-uppercase="off"
            disabled={!linkSettled}
            onChange={(event) => setTypedMessage(event.target.value)}
            onKeyDown={onMessageKeyDown}
          />
        </Field>
        {linkDroppedFromMessage ? (
          <>
            <span />
            <span className={styles.whatsappStatusError}>
              The message no longer contains the link — the customer will not get the bill.{" "}
              <button type="button" className={styles.whatsappInlineLink} onClick={() => setTypedMessage(null)}>
                Restore the message
              </button>
            </span>
          </>
        ) : null}

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

        <Field label="Bill">
          <span className={styles.whatsappPdfStatus}>
            {pdf.status === "error" ? (
              <>
                <span className={styles.whatsappStatusError}>{pdf.message}</span>
                <button type="button" className={quotationStyles.button} onClick={pdf.retry}>
                  Try again
                </button>
              </>
            ) : pdf.status !== "ready" ? (
              <span className={quotationStyles.modalNote}>{pdf.message}</span>
            ) : link ? (
              <span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.whatsappLinkUrl}>
                  {filename}
                </a>
                {pdf.pageCount ? ` · ${pdf.pageCount} page${pdf.pageCount === 1 ? "" : "s"}` : ""} · link works
                until {formatLinkExpiry(link.expiresAt)}
              </span>
            ) : attachInstead ? (
              <>
                <span className={styles.whatsappStatusError}>
                  No link ({linkError}) — the PDF will be saved for you to attach in the chat.
                </span>
                <button type="button" className={quotationStyles.button} onClick={retryLink}>
                  Try again
                </button>
              </>
            ) : (
              <span className={quotationStyles.modalNote}>Preparing the link to the bill…</span>
            )}
          </span>
        </Field>
      </div>
    </ModalShell>
  );
}
