// The server's live change feed (`GET /data-changes/stream`, server-sent events).
// After every successful write by ANOTHER session the server sends a `change`
// event; this module turns it into a `remote-mutation` on the refresh bus, so a
// record saved at one counter shows up on every other counter's open lists,
// modals and dropdowns at once - not only when that user next focuses the tab.
//
// One connection per browser, not per tab: a Web Lock elects the tab that holds
// it, and that tab relays every change to its siblings over the bus's
// BroadcastChannel. Over HTTP/1.1 (the local HTTPS dev server) a browser allows
// six connections per host, and a held-open stream per tab would starve the
// seventh tab's requests. When the holder closes, the next tab waiting on the
// lock takes over.
//
// `fetch`, not `EventSource`: the stream is authenticated with the bearer token,
// and EventSource cannot send an Authorization header.

import { notifyRemoteDataChanged } from "./refresh-bus";

export type ServerChangeFeedOptions = {
  url: string;
  // Read on every (re)connect, so a token refreshed meanwhile is picked up.
  getAuthorization: () => string | null;
  // Seams for tests.
  fetchImpl?: typeof fetch;
  onChange?: (scope: string) => void;
  locks?: LockManager | null;
};

export type ServerFeedEvent = { type: string; data: string };

const LOCK_NAME = "erp-data-change-feed";
// A busy shop saves several times a second, and each relay makes every open
// screen re-read its list, lookups and config (a dozen-odd GETs). Hand changes
// on at most this often: the first one at once, so a lone save still shows up
// instantly; the rest of a burst in one trailing pass.
const RELAY_WINDOW_MS = 2_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
// A stream that lived this long counts as healthy, so the next drop retries fast.
const HEALTHY_STREAM_MS = 10_000;

// Parse a server-sent-events byte stream into events. Handles frames split
// across chunks, CRLF line endings, comment lines and multi-line data.
export async function readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerFeedEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flushFrame = (frame: string) => {
    let type = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) {
        continue;
      }
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") {
        type = value;
      } else if (field === "data") {
        data.push(value);
      }
    }
    if (data.length > 0 || type !== "message") {
      onEvent({ type, data: data.join("\n") });
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        flushFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Leading + trailing throttle: the first call runs at once, calls inside the
// window collapse into one run at its end.
export function createRelayThrottle(run: (scope: string) => void, windowMs = RELAY_WINDOW_MS) {
  let windowOpenUntil = 0;
  let trailingScope: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const closeWindow = () => {
    timer = null;
    if (trailingScope !== null) {
      const scope = trailingScope;
      trailingScope = null;
      windowOpenUntil = Date.now() + windowMs;
      timer = setTimeout(closeWindow, windowMs);
      run(scope);
    }
  };
  return {
    push(scope: string) {
      if (Date.now() >= windowOpenUntil && timer === null) {
        windowOpenUntil = Date.now() + windowMs;
        timer = setTimeout(closeWindow, windowMs);
        run(scope);
        return;
      }
      trailingScope = scope;
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      trailingScope = null;
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function readBootId(data: string): string | null {
  try {
    const bootId = (JSON.parse(data) as { bootId?: unknown }).bootId;
    return typeof bootId === "string" ? bootId : null;
  } catch {
    return null;
  }
}

function readResource(data: string): string {
  try {
    const resource = (JSON.parse(data) as { resource?: unknown }).resource;
    return typeof resource === "string" && resource ? resource : "unknown";
  } catch {
    return "unknown";
  }
}

async function holdFeed(options: ServerChangeFeedOptions, signal: AbortSignal): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const relay = createRelayThrottle(options.onChange ?? notifyRemoteDataChanged);
  let lastBootId: string | null = null;
  let failures = 0;
  try {
    while (!signal.aborted) {
      const authorization = options.getAuthorization();
      const startedAt = Date.now();
      if (authorization) {
        try {
          const response = await fetchImpl(options.url, {
            headers: { Authorization: authorization, Accept: "text/event-stream" },
            cache: "no-store",
            signal,
          });
          if (response.ok && response.body) {
            await readServerSentEvents(response.body, (event) => {
              if (event.type === "change") {
                relay.push(`server:${readResource(event.data)}`);
              } else if (event.type === "ready") {
                const bootId = readBootId(event.data);
                // Same server process as before the drop: writes may have landed
                // while this browser was cut off, so re-read once. A new boot (or
                // the first connect) has nothing to catch up on.
                if (lastBootId !== null && bootId !== null && bootId === lastBootId) {
                  relay.push("server:reconnect");
                }
                lastBootId = bootId ?? lastBootId;
              }
            });
          }
        } catch {
          // Network drop, server restart or an abort; the loop decides below.
        }
      }
      if (signal.aborted) {
        return;
      }
      failures = Date.now() - startedAt >= HEALTHY_STREAM_MS ? 0 : failures + 1;
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));
      await sleep(delay, signal);
    }
  } finally {
    relay.cancel();
  }
}

// Start listening (or queue up to, if another tab holds the feed). Returns the
// stop function: it closes the stream and hands the lock to the next tab.
export function startServerChangeFeed(options: ServerChangeFeedOptions): () => void {
  if (typeof window === "undefined" || typeof ReadableStream === "undefined") {
    return () => undefined;
  }
  const controller = new AbortController();
  const locks =
    options.locks !== undefined
      ? options.locks
      : typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks
        : null;
  if (locks) {
    locks
      .request(LOCK_NAME, { signal: controller.signal }, () => holdFeed(options, controller.signal))
      // AbortError when stopped while still waiting for the lock.
      .catch(() => undefined);
  } else {
    // No Web Locks (very old browser): every tab keeps its own stream.
    void holdFeed(options, controller.signal);
  }
  return () => controller.abort();
}
