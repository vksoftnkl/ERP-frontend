/**
 * The header's account menu, as data: how it names the signed-in user and
 * what its Change password form refuses. Pure: no React, no DOM beyond
 * reading a keyboard event.
 *
 * The session (`UserInfo`) carries only the login name and the role; the
 * display name, email and last login come from the user's own
 * `/user-administration/get` row when that read succeeds.
 */

/** "Arun Kumar" → "AK", "ADMIN" → "AD"; blank when there is no name. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

/** `usr_type` as a caption — "SUPER ADMIN" → "Super Admin"; blank for none. */
export function roleLabelOf(userType: string | null | undefined): string {
  return (userType ?? "")
    .trim()
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export type UserNameSource = {
  usrDisplayName?: string | null;
  usrFullName?: string | null;
  usrLoginName?: string | null;
};

/** The display name, else the full name, else the login name the session holds. */
export function displayNameOf(
  profile: UserNameSource | null | undefined,
  sessionUserName: string | null | undefined,
): string {
  const candidates = [
    profile?.usrDisplayName,
    profile?.usrFullName,
    profile?.usrLoginName,
    sessionUserName,
  ];
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (text) return text;
  }
  return "User";
}

type KeyLike = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** `?` opens the key sheet — the key itself, so Shift is expected and any other modifier is not. */
export function isShortcutSheetKey(event: KeyLike): boolean {
  return event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export type PasswordChangeForm = { password: string; confirm: string };
export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeForm, string>>;

/**
 * The DTO only asks for a non-blank password, and the server trims it before
 * hashing — so the comparison is of the trimmed text too.
 */
export function validatePasswordChange(form: PasswordChangeForm): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  const password = form.password.trim();
  if (!password) {
    errors.password = "Enter a new password.";
  } else if (form.confirm.trim() !== password) {
    errors.confirm = "The two passwords do not match.";
  }
  return errors;
}
