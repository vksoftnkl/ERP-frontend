"use client";

/**
 * Labels of a posted GRN / purchase bill (Qt `PurchaseLabelDialog`, NexERP
 * 6e025ef ENT-21) over GET /purchase/labels/from-doc: one row per SALEABLE
 * allocation row, Copies = received + free (damaged pieces get none; a bill
 * from a GRN prints its GRN's rows). Copies can be changed; "Preview & print"
 * hands the roll — one 50 × 38 mm label per page, Code 128 of the batch / EAN
 * (../purchase-labels.ts) — to the browser's print preview.
 *
 * And the step after a post (Qt `PurchaseAfterPost::run`): `usePurchaseAfterPost`
 * asks for the labels per purchase.labels_after_post (ASK / ALWAYS / NEVER),
 * then opens Change Selling (menu 30) when purchase.price_update says
 * OPEN_CHANGE_SELLING (with allow_price_update on).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { confirm } from "@/lib/confirm";
import { useAppDispatch } from "@/store/hooks";
import { purchaseSharedApi, useGetPurchaseSettingsQuery } from "../purchase.api";
import { usePurchaseLabelsFromDocMutation } from "../purchase-dialogs.api";
import type { PurchaseAfterPostTarget, PurchaseLabelDialogProps, PurchaseSettings } from "../purchase-dialogs.types";
import { purchaseRefusalText, text } from "../purchase.format";
import { copiesOf, labelLinesOf, labelRate, labelsPrintDocument, totalCopies, type LabelLine } from "../purchase-labels";
import styles from "./purchase-dialogs.module.scss";

/** Change Selling Price (menu 30). */
export const CHANGE_SELLING_ROUTE = "/stock/change-selling-price";

const COLUMNS: readonly { title: string; width: number; right?: boolean }[] = [
  { title: "Item", width: 30 },
  { title: "Size", width: 8 },
  { title: "Colour", width: 10 },
  { title: "Model", width: 10 },
  { title: "Barcode", width: 15 },
  { title: "MRP", width: 9, right: true },
  { title: "Price", width: 9, right: true },
  { title: "Copies", width: 9, right: true },
];

/** Prints an HTML document from a hidden frame (the browser's own preview), then drops the frame. */
function printDocument(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  let removed = false;
  const drop = () => {
    if (!removed) {
      removed = true;
      frame.remove();
    }
  };
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      drop();
      return;
    }
    view.addEventListener("afterprint", () => window.setTimeout(drop, 0));
    view.focus();
    view.print();
    // A browser without `afterprint` still gets its frame back.
    window.setTimeout(drop, 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

export function PurchaseLabelDialog(props: PurchaseLabelDialogProps) {
  return props.open ? <OpenLabelDialog {...props} /> : null;
}

function OpenLabelDialog({ docType, docId, accYear, title, onClose }: PurchaseLabelDialogProps) {
  const [lines, setLines] = useState<LabelLine[]>([]);
  const [copiesText, setCopiesText] = useState<string[]>([]);
  const [status, setStatus] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [load] = usePurchaseLabelsFromDocMutation();

  useEffect(() => {
    let active = true;
    load({ docType, docId, accYear })
      .unwrap()
      .then((rows) => {
        if (!active) return;
        const loaded = labelLinesOf(rows);
        setLines(loaded);
        setCopiesText(loaded.map((line) => String(line.copies)));
        setStatus({ loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (active) setStatus({ loading: false, error: purchaseRefusalText(error) });
      });
    return () => {
      active = false;
    };
  }, [accYear, docId, docType, load]);

  const edited = lines.map((line, index) => ({ ...line, copies: copiesOf(copiesText[index] ?? "") }));
  const total = totalCopies(edited);
  const sum = status.loading
    ? "Loading…"
    : status.error
      ? status.error
      : lines.length === 0
        ? "Nothing to label (no saleable rows)."
        : `${total} label${total === 1 ? "" : "s"}`;

  const print = () => {
    if (total > 0) {
      printDocument(labelsPrintDocument(edited, `Labels — ${title}`));
    }
  };

  return (
    <ModalShell
      title={`Labels — ${title}`}
      isOpen
      fixedHeight
      panelClassName={styles.labelsPanel}
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <span className={cx(styles.actionsLeft, status.error ? styles.problem : styles.hint)}>{sum}</span>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={total === 0} onClick={print}>
            Preview &amp; print
          </button>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Close · Esc
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.hint}>One label per piece received (free included); damaged pieces get none. Change Copies to print more or fewer.</p>
        <div className={cx(quotationStyles.gridViewport, styles.viewport)}>
          <table className={cx(quotationStyles.grid, styles.table)}>
            <colgroup>
              {COLUMNS.map((column) => (
                <col key={column.title} style={{ width: `${column.width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.title} scope="col">
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className={styles.emptyCell}>
                    {sum}
                  </td>
                </tr>
              ) : null}
              {lines.map(({ row }, index) => {
                const cells = [text(row.itemName), text(row.size), text(row.colour), text(row.model), text(row.barcode), labelRate(row.mrp), labelRate(row.price)];
                return (
                  <tr key={row.rowId || index} className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}>
                    {cells.map((value, column) => (
                      <td key={COLUMNS[column].title}>
                        <div className={cx(quotationStyles.cellText, COLUMNS[column].right && quotationStyles.alignRight)} title={value || undefined}>
                          {value || " "}
                        </div>
                      </td>
                    ))}
                    <td>
                      <input
                        className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
                        type="text"
                        inputMode="numeric"
                        value={copiesText[index] ?? ""}
                        aria-label={`Copies of ${text(row.itemName)}`}
                        autoComplete="off"
                        data-uppercase="off"
                        autoFocus={index === 0}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (/^\d{0,4}$/.test(value)) {
                            setCopiesText((current) => current.map((old, at) => (at === index ? value : old)));
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                            event.preventDefault();
                            const next = event.currentTarget.closest("tr")?.nextElementSibling?.querySelector("input");
                            if (next instanceof HTMLInputElement) {
                              next.focus();
                            } else {
                              print();
                            }
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// After a post
// ---------------------------------------------------------------------------

/**
 * Call `run(target)` right after a GRN / bill posts; render `element` once on
 * the screen. Labels per purchase.labels_after_post: ALWAYS opens them, ASK
 * asks first, NEVER does nothing. Then, when purchase.allow_price_update is on
 * and purchase.price_update = OPEN_CHANGE_SELLING, Change Selling (menu 30)
 * opens — after the labels dialog closes, so leaving the screen never takes it
 * away mid-print. Settings that cannot be read (no View on menu 24): nothing
 * more after the post, as in Qt.
 */
export function usePurchaseAfterPost(scope: { companyId: string; branchId: string }): {
  run: (target: PurchaseAfterPostTarget) => void;
  element: ReactNode;
} {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const ready = Boolean(scope.companyId && scope.branchId);
  const { data: settings } = useGetPurchaseSettingsQuery(
    { companyId: scope.companyId, branchId: scope.branchId },
    { skip: !ready },
  );
  const [target, setTarget] = useState<PurchaseAfterPostTarget | null>(null);
  const sellingAfterLabels = useRef(false);
  const latest = useRef({ settings, scope, ready });
  useEffect(() => {
    latest.current = { settings, scope, ready };
  });

  const run = useCallback(
    (next: PurchaseAfterPostTarget) => {
      if (!next.docId) {
        return;
      }
      void (async () => {
        const { settings: known, scope: tenant, ready: canAsk } = latest.current;
        let rules: PurchaseSettings | undefined = known;
        if (!rules && canAsk) {
          try {
            rules = await dispatch(
              purchaseSharedApi.endpoints.getPurchaseSettings.initiate(
                { companyId: tenant.companyId, branchId: tenant.branchId },
                { subscribe: false, forceRefetch: true },
              ),
            ).unwrap();
          } catch {
            return;
          }
        }
        if (!rules) {
          return;
        }
        const openSelling = rules.allowPriceUpdate && rules.priceUpdate === "OPEN_CHANGE_SELLING";
        const wantLabels =
          rules.labelsAfterPost === "ALWAYS" ||
          (rules.labelsAfterPost !== "NEVER" &&
            (await confirm({
              title: "Labels",
              message: `Print the labels of ${next.refno || "this document"} now?`,
              confirmLabel: "Labels…",
              cancelLabel: "Not now",
            })));
        if (wantLabels) {
          sellingAfterLabels.current = openSelling;
          setTarget(next);
        } else if (openSelling) {
          router.push(CHANGE_SELLING_ROUTE);
        }
      })();
    },
    [dispatch, router],
  );

  const onClose = useCallback(() => {
    setTarget(null);
    if (sellingAfterLabels.current) {
      sellingAfterLabels.current = false;
      router.push(CHANGE_SELLING_ROUTE);
    }
  }, [router]);

  const element = target ? (
    <PurchaseLabelDialog
      open
      docType={target.docType}
      docId={target.docId}
      accYear={target.accYear}
      title={target.refno || (target.docType === "GRN" ? "GRN" : "Purchase bill")}
      onClose={onClose}
    />
  ) : null;

  return { run, element };
}
