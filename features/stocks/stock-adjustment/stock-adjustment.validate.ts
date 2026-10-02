/**
 * Stock Adjustment — what the screen can tell without the server: the same
 * rules `StockAdjustmentService.check` runs (stock-adjustment.rules.ts and the
 * service), in the Qt screen's words, so the operator hears them before the
 * round trip; the save gates of `saveDocument`; and the mapping of the
 * server's own refusals back onto the lines. Pure.
 */
import { isRealDate } from "@/features/sales/quotation/quotation.utils";
import { CANCEL_REASON_MIN_LENGTH, RELOT_OUT_CODE } from "./stock-adjustment.constants";
import { cellNumber, nearlyZero, qtyCell } from "./stock-adjustment.format";
import { isInward, lineFactor, reasonById, rowHasItem } from "./stock-adjustment.state";
import type {
  AdjustmentDraft,
  StockErrorDetail,
  StockVoucherLineProblem,
} from "./stock-adjustment.types";

/**
 * clientProblems — line key → "Line <row> — <message>", in grid order, one
 * message per line (the first rule it fails). Only a DRAFT is judged: a posted
 * or cancelled document has nothing left to fix, and its holdings have moved
 * on since.
 */
export function clientProblems(draft: AdjustmentDraft): Map<string, string> {
  const found = new Map<string, { row: number; message: string }>();
  if (draft.status !== "DRAFT") {
    return new Map();
  }
  const kind = draft.kind;
  const headerRemarks = draft.remarks.trim() !== "";
  const say = (row: number, key: string, message: string) => {
    if (!found.has(key)) {
      found.set(key, { row, message: `Line ${row + 1} — ${message}` });
    }
  };

  draft.lines.forEach((line, row) => {
    if (!rowHasItem(line)) {
      return;
    }
    const name = line.itemName.trim();
    const reason = reasonById(draft, line.reasonId);
    const qty = cellNumber(line.qty);
    const picked = line.lotId.trim() !== "";

    if (!reason) {
      say(row, line.key, `${name} names no reason. Every line says why it moves.`);
      return;
    }
    if (nearlyZero(qty)) {
      say(row, line.key, `${name} has no quantity.`);
      return;
    }
    if (reason.requireRemarks && !line.remarks.trim() && !headerRemarks) {
      say(row, line.key, `${reason.name} needs remarks.`);
    }
    if ((kind === "Move" || kind === "Expiry") && !picked) {
      say(row, line.key, `${name} names no lot — pick it from stock (F2).`);
    }
    if (kind === "Relot" && reason.code === RELOT_OUT_CODE && !picked) {
      say(row, line.key, "the OUT half of a re-lot must name the lot it leaves (F2).");
    }
    if (kind === "Move") {
      const to = line.toBucket.trim();
      if (!to) {
        say(row, line.key, `${name} names no bucket to move to.`);
      } else if (to === line.bucket.trim()) {
        say(row, line.key, `${name} moves stock from ${to} into ${to}.`);
      }
    }
    // Outward against what the picked holding has — the server refuses it
    // (BLOCK) whatever the item's own negative-stock policy says. Judged only
    // once the holding's figure is known.
    if (picked && (qty < 0 || kind === "Move") && line.available !== null) {
      const available = line.available;
      if (Math.abs(qty) > available + 0.0000005) {
        say(
          row,
          line.key,
          `${name} takes ${qtyCell(Math.abs(qty))} but the holding has ${qtyCell(available)}.`,
        );
      }
    }
    if (
      isInward(kind, line) &&
      kind === "Adjustment" &&
      draft.rateSource === "MANUAL" &&
      (line.costRate ?? 0) <= 0
    ) {
      say(row, line.key, `${name} comes in under MANUAL with no cost.`);
    }
  });

  if (kind === "Relot") {
    const pairs = new Map<string, { out: number; in: number; firstRow: number }>();
    draft.lines.forEach((line, row) => {
      if (!rowHasItem(line)) {
        return;
      }
      const pair = pairs.get(line.itemId) ?? { out: 0, in: 0, firstRow: row };
      const base = cellNumber(line.qty) * lineFactor(line);
      if (base < 0) {
        pair.out += -base;
      } else {
        pair.in += base;
      }
      pairs.set(line.itemId, pair);
    });
    // The IN half must land in a DIFFERENT lot. The server refuses this at
    // save; saying it here spares the round trip. An untracked item has
    // exactly one lot per bucket: nothing to re-lot.
    draft.lines.forEach((line, row) => {
      if (!rowHasItem(line) || !isInward(kind, line)) {
        return;
      }
      const signature = line.trackSignature.trim();
      if (!signature || signature === "N") {
        say(
          row,
          line.key,
          `${line.itemName.trim()} is not tracked by batch, expiry or MRP, so it has one lot — ` +
            "there is nothing to re-lot it into.",
        );
        return;
      }
      for (const other of draft.lines) {
        if (
          other.key === line.key ||
          !rowHasItem(other) ||
          isInward(kind, other) ||
          other.itemId !== line.itemId
        ) {
          continue;
        }
        const same =
          other.batchNo.trim() === line.batchNo.trim() &&
          other.expiryDate.trim() === line.expiryDate.trim() &&
          Math.abs((other.mrp ?? 0) - (line.mrp ?? 0)) < 0.005 &&
          other.serialNo.trim() === line.serialNo.trim();
        if (same) {
          say(
            row,
            line.key,
            "the IN half has the same batch / expiry / MRP as the lot it leaves — key the CORRECT identity.",
          );
        }
      }
    });
    for (const [, pair] of pairs) {
      if (!nearlyZero(pair.out - pair.in)) {
        const first = draft.lines[pair.firstRow];
        say(
          pair.firstRow,
          first.key,
          `the re-lot of ${first.itemName.trim()} does not balance (${qtyCell(pair.out)} out, ${qtyCell(pair.in)} in).`,
        );
      }
    }
  }

  return new Map(
    [...found.entries()]
      .sort(([, left], [, right]) => left.row - right.row)
      .map(([key, value]) => [key, value.message]),
  );
}

/**
 * refreshValidationStrip — the server's refusals and the screen's own, the
 * server's winning on a line both name, in grid order. Null when all is clean.
 */
export function validationStrip(
  draft: AdjustmentDraft,
): { text: string; problems: Map<string, string> } | null {
  const local = clientProblems(draft);
  const problems = new Map<string, string>();
  for (const line of draft.lines) {
    const message = draft.serverProblems[line.key] ?? local.get(line.key);
    if (message) {
      problems.set(line.key, message);
    }
  }
  if (problems.size === 0) {
    return null;
  }
  const [first] = problems.values();
  let text = `Validation · ${first}`;
  if (problems.size > 1) {
    text += `   (+${problems.size - 1} more)`;
  }
  text += "   Save shows every line's message; nothing posts until all pass.";
  return { text, problems };
}

export type SaveRefusal = {
  level: "warn" | "info";
  title: string;
  message: string;
  /** Where to send the operator: the godown, the date, or a line's Qty cell. */
  focus?: "godown" | "date" | { lineKey: string };
};

export const GODOWN_FIRST: SaveRefusal = {
  level: "warn",
  title: "Godown first",
  message:
    "Choose the godown before keying lines — an adjustment is about one godown, and the stock is picked from it.",
  focus: "godown",
};

/**
 * saveDocument's gates, in its order: the status, the mode, the godown, the
 * date, the device, at least one line, and then every rule the screen can
 * check — all at once, in the one popup a server refusal gets too.
 */
export function checkBeforeSave(draft: AdjustmentDraft, post: boolean): SaveRefusal | null {
  if (draft.status !== "DRAFT") {
    return {
      level: "warn",
      title: "Not a draft",
      message: `${draft.refno} is ${draft.status} and cannot be saved again.`,
    };
  }
  if (draft.mode === "browse") {
    return { level: "info", title: "Read-only", message: "Press Edit to change this draft first." };
  }
  if (!draft.godownId) {
    return GODOWN_FIRST;
  }
  if (!isRealDate(draft.docDate)) {
    return { level: "warn", title: "Date required", message: "Enter the document date.", focus: "date" };
  }
  if (!draft.deviceId) {
    return {
      level: "warn",
      title: "No device",
      message:
        "This session has no device id, and the device is what numbers the document. Log in from a registered device.",
    };
  }
  if (!draft.lines.some(rowHasItem)) {
    return { level: "warn", title: "No lines", message: "Add at least one line." };
  }
  const problems = clientProblems(draft);
  if (problems.size > 0) {
    const [firstKey] = problems.keys();
    return {
      level: "warn",
      title: post ? "This document cannot be saved yet" : "This draft cannot be saved yet",
      message: `${problems.size} line(s) have to be fixed first:\n\n${[...problems.values()].join("\n")}`,
      focus: { lineKey: firstKey },
    };
  }
  return null;
}

/** The Save (F5) question: posting freezes the document. */
export function postConfirmMessage(draft: AdjustmentDraft, outText: string, inText: string): string {
  const what =
    draft.kind === "Move" || draft.kind === "Relot"
      ? "No accounts voucher is written — the stock stays the company's."
      : "A Stock Journal voucher is written with it.";
  return (
    "Posting moves the stock and freezes this document — it can only be cancelled afterwards. " +
    `${what}\n\n${outText}\n${inText}`
  );
}

/**
 * showServerRefusal — a 422 from the adjustment rules names each bad line as
 * "lines.<index>": the index into the payload, mapped back to the line it came
 * from.
 */
export function mapServerRefusal(
  errors: readonly StockErrorDetail[] | undefined,
  sentKeys: readonly string[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const error of errors ?? []) {
    const match = /^lines\.(\d+)/.exec(error?.field ?? "");
    if (!match) {
      continue;
    }
    const key = sentKeys[Number(match[1])];
    if (key) {
      problems[key] = error.message ?? "";
    }
  }
  return problems;
}

/** The 422's errors[], wherever the base query left the body. */
export function errorDetailsOf(error: unknown): StockErrorDetail[] {
  const data = (error as { data?: unknown } | null)?.data;
  const errors = (data as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry): entry is { field?: unknown; message?: unknown } => typeof entry === "object" && entry !== null)
    .map((entry) => ({ field: String(entry.field ?? ""), message: String(entry.message ?? "") }));
}

/**
 * What the operator reads from a refused request — the Qt ApiClient's shapes:
 * the server's headline, then every `errors[]` entry as "• field — message".
 * The headline is kept: "This stock adjustment cannot be saved" is still the
 * useful line above the per-line reasons.
 */
export function apiErrorText(error: unknown): string {
  const record = (error ?? {}) as { data?: unknown; message?: unknown };
  const data = (record.data ?? {}) as { message?: unknown; errors?: unknown };
  const lines: string[] = [];
  if (typeof data.message === "string" && data.message.trim()) {
    lines.push(data.message.trim());
  } else if (data.message && typeof data.message === "object") {
    const nested = (data.message as { message?: unknown }).message;
    if (Array.isArray(nested)) {
      lines.push(...nested.map((entry) => String(entry)));
    } else if (typeof nested === "string" && nested.trim()) {
      lines.push(nested.trim());
    }
  } else if (typeof record.message === "string" && record.message.trim()) {
    lines.push(record.message.trim());
  }
  if (Array.isArray(data.errors)) {
    for (const entry of data.errors) {
      if (typeof entry === "string") {
        lines.push(entry);
        continue;
      }
      const field = String((entry as { field?: unknown })?.field ?? "");
      const text = String((entry as { message?: unknown })?.message ?? "");
      if (!text || lines.includes(text)) {
        continue;
      }
      lines.push(field ? `• ${field} — ${text}` : text);
    }
  }
  return lines.join("\n") || "An unexpected error occurred.";
}

/**
 * validateDocument's answer — the server's line numbers (1-based, in the saved
 * order) mapped back to the lines sent.
 */
export function mapValidateRows(
  rows: readonly StockVoucherLineProblem[],
  sentKeys: readonly string[],
): { problems: string[]; byKey: Record<string, string> } {
  const problems: string[] = [];
  const byKey: Record<string, string> = {};
  for (const row of rows) {
    const problem = (row.problem ?? "").trim();
    if (!problem) {
      continue;
    }
    problems.push(problem);
    const lineNo = Number(row.lineNo);
    if (lineNo >= 1 && lineNo <= sentKeys.length) {
      byKey[sentKeys[lineNo - 1]] = problem;
    }
  }
  return { problems, byKey };
}

/** The cancel prompt's answer, refused the way CancelStockAdjustmentDto refuses it. */
export function cancelReasonProblem(reason: string): string | null {
  const text = reason.trim();
  if (!text) {
    return "Type the reason";
  }
  if (text.length < CANCEL_REASON_MIN_LENGTH) {
    return "reason must say something — at least 3 characters.";
  }
  return null;
}
