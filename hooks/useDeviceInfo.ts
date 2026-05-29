"use client";
import { useMemo } from "react";

const DEVICE_FINGERPRINT_KEY = "erp_device_fingerprint";

function generateMacFingerprint(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  // Clear multicast bit and set locally administered bit
  bytes[0] = (bytes[0] & 0xfe) | 0x02;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
}

function getOrCreateFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(DEVICE_FINGERPRINT_KEY);
    if (stored && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(stored)) return stored;
    const fresh = generateMacFingerprint();
    localStorage.setItem(DEVICE_FINGERPRINT_KEY, fresh);
    return fresh;
  } catch {
    return generateMacFingerprint();
  }
}

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  return "Other";
}

function detectDeviceType(): string {
  if (typeof navigator === "undefined") return "Web";
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "Mobile";
  return "Desktop";
}

export function useDeviceInfo() {
  return useMemo(
    () => ({
      macAddress: getOrCreateFingerprint(),
      platform: detectPlatform(),
      deviceType: detectDeviceType(),
    }),
    [],
  );
}
