import { NextRequest, NextResponse } from "next/server";

const GST_LOOKUP_ENDPOINT =
  process.env.GST_LOOKUP_ENDPOINT?.trim() ||
  "https://deprecatedgstapi.charteredinfo.com/commonapi/v1.1/search";
const GST_LOOKUP_ASPID =
  process.env.GST_LOOKUP_ASPID?.trim() || "1704563322";
const GST_LOOKUP_PASSWORD =
  process.env.GST_LOOKUP_PASSWORD?.trim() || "VijiElango@2508";
const GST_LOOKUP_SOURCE_GSTIN =
  process.env.GST_LOOKUP_SOURCE_GSTIN?.trim() || "34AACCC1596Q002";
const GST_LOOKUP_ACTION =
  process.env.GST_LOOKUP_ACTION?.trim() || "TP";
const GST_LOOKUP_PATTERN = /^[0-9A-Z]{15}$/;
const GST_LOOKUP_DATA_KEYS = ["data", "taxpayer", "result"] as const;
const GST_LOOKUP_DETAIL_KEYS = [
  "lgnm",
  "tradeNam",
  "tradeName",
  "pradr",
  "dty",
] as const;
export const dynamic = "force-dynamic";
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function getRecordValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = source[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}
function extractMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string") {
    const normalized = payload.trim();
    return normalized || fallback;
  }
  if (!isRecord(payload)) {
    return fallback;
  }
  for (const key of ["message", "error", "detail", "status_desc", "statusDesc"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}
function looksLikeGstLookupData(payload: Record<string, unknown>): boolean {
  return GST_LOOKUP_DETAIL_KEYS.some((key) => key in payload);
}
function extractLookupData(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const nested = getRecordValue(payload, GST_LOOKUP_DATA_KEYS);
  if (nested && looksLikeGstLookupData(nested)) {
    return nested;
  }
  return looksLikeGstLookupData(payload) ? payload : null;
}
async function parseResponseBody(response: Response): Promise<unknown> {
  const responseText = await response.text();
  const normalized = responseText.trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}
function buildLookupUrl(gstin: string): string {
  const lookupUrl = new URL(GST_LOOKUP_ENDPOINT);
  lookupUrl.searchParams.set("aspid", GST_LOOKUP_ASPID);
  lookupUrl.searchParams.set("password", GST_LOOKUP_PASSWORD);
  lookupUrl.searchParams.set("Action", GST_LOOKUP_ACTION);
  lookupUrl.searchParams.set("Gstin", GST_LOOKUP_SOURCE_GSTIN);
  lookupUrl.searchParams.set("SearchGstin", gstin);
  return lookupUrl.toString();
}
export async function GET(request: NextRequest) {
  const gstin =
    request.nextUrl.searchParams.get("gstin")?.trim().toUpperCase() || "";
  if (!GST_LOOKUP_PATTERN.test(gstin)) {
    return NextResponse.json(
      {
        message: "GSTIN must be exactly 15 letters or numbers.",
      },
      { status: 400 },
    );
  }
  try {
    const upstreamResponse = await fetch(buildLookupUrl(gstin), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
    const upstreamPayload = await parseResponseBody(upstreamResponse);
    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          message: extractMessage(
            upstreamPayload,
            "Unable to load GST details from the GST service.",
          ),
        },
        { status: upstreamResponse.status },
      );
    }
    const data = extractLookupData(upstreamPayload);
    if (!data) {
      return NextResponse.json(
        {
          message: extractMessage(
            upstreamPayload,
            "GST details were not available for this GSTIN.",
          ),
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Unable to reach the GST service right now.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
