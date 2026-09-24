/**
 * The server's own sentence, shown as it arrives.
 *
 * The cheques module answers `{ success:false, message, errors:[{field,
 * message}] }`, and the per-field messages are written for the operator —
 * "55491 is CLEARED — it is settled and nothing further happens to it". The
 * envelope's `message` on a validation failure is "Validation failed", which
 * tells nobody anything, so the field list is read first. Nothing composed on
 * the client would be better than the server's words.
 *
 * The configured-grid runner nests one level deeper —
 * `{ message: { message: "Grid 109 configured SQL failed: …" } }` — so that
 * shape is read too.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageIn(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(messageIn).filter(Boolean).join(" ");
  }
  if (isRecord(value)) {
    return messageIn(value.message);
  }
  return "";
}

export function chequeError(error: unknown): string {
  if (isRecord(error) && isRecord(error.data)) {
    const details = error.data.errors;
    if (Array.isArray(details)) {
      const messages = details.map(messageIn).filter((message) => message.length > 0);
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
    const message = messageIn(error.data.message);
    if (message) {
      return message;
    }
  }
  if (isRecord(error)) {
    const message = messageIn(error.message) || messageIn(error.error);
    if (message) {
      return message;
    }
  }
  return "The request failed.";
}
