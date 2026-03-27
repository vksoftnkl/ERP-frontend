import { createSign } from "node:crypto";

type GoogleTranslateCredentials = {
  clientEmail: string;
  location: string;
  privateKey: string;
  projectId: string;
  requestTimeoutMs: number;
  sourceLanguageCode: string;
  targetLanguageCode: string;
};

type GoogleAccessTokenCache = {
  accessToken: string;
  expiresAt: number;
};

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TRANSLATE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_TRANSLATE_API_BASE = "https://translation.googleapis.com/v3";
const DEFAULT_TIMEOUT_MS = 4000;

let accessTokenCache: GoogleAccessTokenCache | null = null;

function getEnvValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function toPositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCredentials(): GoogleTranslateCredentials | null {
  const projectId = getEnvValue("GOOGLE_TRANSLATE_PROJECT_ID");
  const clientEmail = getEnvValue("GOOGLE_TRANSLATE_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_TRANSLATE_PRIVATE_KEY ?? "",
  );

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    clientEmail,
    location: getEnvValue("GOOGLE_TRANSLATE_LOCATION") || "global",
    privateKey,
    projectId,
    requestTimeoutMs: toPositiveInteger(
      getEnvValue("GOOGLE_TRANSLATE_TIMEOUT_MS"),
      DEFAULT_TIMEOUT_MS,
    ),
    sourceLanguageCode:
      getEnvValue("GOOGLE_TRANSLATE_SOURCE_LANGUAGE") || "ta",
    targetLanguageCode:
      getEnvValue("GOOGLE_TRANSLATE_TARGET_LANGUAGE") || "ta",
  };
}

export function isGoogleTranslateConfigured(): boolean {
  return getCredentials() !== null;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildServiceAccountJwt(
  credentials: GoogleTranslateCredentials,
): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: nowInSeconds + 3600,
    iat: nowInSeconds,
    iss: credentials.clientEmail,
    scope: GOOGLE_TRANSLATE_SCOPE,
    sub: credentials.clientEmail,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(credentials.privateKey);
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return null;
  }
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (isRecord(payload.error)) {
    const nestedMessage = payload.error.message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return fallback;
}

async function getAccessToken(
  credentials: GoogleTranslateCredentials,
): Promise<string> {
  if (
    accessTokenCache &&
    accessTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return accessTokenCache.accessToken;
  }
  const assertion = buildServiceAccountJwt(credentials);
  const tokenResponse = await fetchWithTimeout(
    GOOGLE_OAUTH_TOKEN_URL,
    {
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
    credentials.requestTimeoutMs,
  );
  const tokenPayload = await parseJsonBody(tokenResponse);
  if (!tokenResponse.ok || !isRecord(tokenPayload)) {
    throw new Error(
      extractErrorMessage(
        tokenPayload,
        "Unable to authorize with Google Cloud Translation.",
      ),
    );
  }
  const accessToken = tokenPayload.access_token;
  const expiresIn = tokenPayload.expires_in;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("Google Cloud Translation returned an empty access token.");
  }
  accessTokenCache = {
    accessToken: accessToken.trim(),
    expiresAt:
      Date.now() +
      (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
  };
  return accessTokenCache.accessToken;
}
function extractTranslatedText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const translations = payload.translations;
  if (!Array.isArray(translations)) {
    return null;
  }
  const firstTranslation = translations[0];
  if (!isRecord(firstTranslation)) {
    return null;
  }
  const translatedText =
    firstTranslation.translatedText ?? firstTranslation.translated_text;
  return typeof translatedText === "string" && translatedText.trim()
    ? translatedText.trim()
    : null;
}
export async function suggestTamilWordsWithGoogle(
  text: string,
): Promise<string[]> {
  const credentials = getCredentials();
  if (!credentials) {
    return [];
  }
  const accessToken = await getAccessToken(credentials);
  const endpoint = `${GOOGLE_TRANSLATE_API_BASE}/projects/${encodeURIComponent(
    credentials.projectId,
  )}/locations/${encodeURIComponent(credentials.location)}:translateText`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      body: JSON.stringify({
        contents: [text],
        mime_type: "text/plain",
        source_language_code: credentials.sourceLanguageCode,
        target_language_code: credentials.targetLanguageCode,
        transliteration_config: {
          enable_transliteration: true,
        },
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
        "x-goog-user-project": credentials.projectId,
      },
      method: "POST",
    },
    credentials.requestTimeoutMs,
  );
  const payload = await parseJsonBody(response);
  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        payload,
        "Unable to load Tamil transliteration from Google Cloud Translation.",
      ),
    );
  }
  const translatedText = extractTranslatedText(payload);
  return translatedText ? [translatedText] : [];
}
