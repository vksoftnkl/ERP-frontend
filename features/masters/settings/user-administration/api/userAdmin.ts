/**
 * The user master's wire, as this screen uses it. The RTK Query endpoints are
 * injected once, in `@/store/api/userAdminApi`; this is the typed face of them
 * plus the one thing the screen needs that the store does not give: the
 * server's own sentence out of a failed call.
 */
export {
  useDeleteUserAdminMutation,
  useLoadUserAdminMutation,
  useSaveUserAdminMutation,
  useSearchUsersQuery,
  type UserListRow,
} from "@/store/api/userAdminApi";
export type {
  ApiFieldError,
  SaveUserAdministrationDto,
  SaveUserMenuDto,
  UserAdminPayload,
  UserMenuPayload,
} from "../domain/wire";

import type { ApiFieldError } from "../domain/wire";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageIn(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(messageIn).filter(Boolean).join(" ");
  if (isRecord(value)) return messageIn(value.message);
  return "";
}

/**
 * What a failed call said, split the way §7.4 wants it: the `errors[]` of a
 * 400 (each with the DTO key it belongs to) and the envelope's message for
 * everything else. `status` lets the caller tell a refusal from an outage.
 */
export function readUserAdminError(error: unknown): {
  status: number | null;
  message: string;
  errors: ApiFieldError[];
} {
  let status: number | null = null;
  let message = "";
  const errors: ApiFieldError[] = [];
  if (isRecord(error)) {
    if (typeof error.status === "number") status = error.status;
    const data = error.data;
    if (isRecord(data)) {
      if (Array.isArray(data.errors)) {
        for (const entry of data.errors) {
          if (isRecord(entry)) {
            errors.push({
              field: typeof entry.field === "string" ? entry.field : null,
              message: messageIn(entry.message) || messageIn(entry),
            });
          } else {
            errors.push({ field: null, message: messageIn(entry) });
          }
        }
      }
      message = messageIn(data.message);
    }
    if (!message) message = messageIn(error.message) || messageIn(error.error);
  }
  if (!message) {
    message =
      status === null
        ? "The server could not be reached."
        : errors.length > 0
          ? "The save was refused."
          : "The request failed.";
  }
  return { status, message, errors };
}

/** One sentence for a popup, the field messages first — they are the ones written for people. */
export function userAdminErrorText(error: unknown): string {
  const { message, errors } = readUserAdminError(error);
  const detail = errors.map((entry) => entry.message ?? "").filter(Boolean).join(" ");
  return detail || message;
}
