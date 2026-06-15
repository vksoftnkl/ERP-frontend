"use client";

export function IconPlaceholder() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4.8 5.6v5.2c0 .55.22 1.08.61 1.47l6.32 6.32a2.1 2.1 0 0 0 2.97 0l4.9-4.9a2.1 2.1 0 0 0 0-2.97L13.28 4.4a2.08 2.08 0 0 0-1.48-.61H6.61A1.81 1.81 0 0 0 4.8 5.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 8.25h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ModalFooterCancelIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5.75 5.75 14.25 14.25M14.25 5.75 5.75 14.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ModalFooterSubmitIcon({ label }: { label: string }) {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes("update")) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4.35 13.95 4 16l2.05-.35 8.38-8.38-1.7-1.7-8.38 8.38Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m11.95 6.35 1.7 1.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (normalizedLabel.includes("close")) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="m5 10.25 3.15 3.15L15.25 6.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 4.75A.75.75 0 0 1 4.75 4h8.6L16 6.65v8.6a.75.75 0 0 1-.75.75H4.75A.75.75 0 0 1 4 15.25V4.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 4v4.2h5.7M7 16v-4h6v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
