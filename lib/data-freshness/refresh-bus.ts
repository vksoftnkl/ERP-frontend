// One place that decides *when* the app should go back to the server for data it
// already has on screen. Nothing here fetches: consumers (RTK Query, useApi,
// dropdown/popup loaders) subscribe and re-read whatever they own.
//
// Signals it emits:
//   focus / visible  - the tab came back, so anything on screen may be stale.
//   reconnect        - the browser went back online.
//   mutation         - THIS tab saved something (any non-GET through useApi).
//   remote-mutation  - ANOTHER tab of this app saved something (BroadcastChannel).
//   manual           - a screen asked for a refresh explicitly.
//
// The point is that a record added/edited straight in the database (or by another
// user, or in another tab) shows up in every list, modal and dropdown without the
// user reloading the tab.

export type DataRefreshReason =
  | "focus"
  | "visible"
  | "reconnect"
  | "mutation"
  | "remote-mutation"
  | "manual";

export type DataRefreshEvent = {
  reason: DataRefreshReason;
  // Free-form hint about what changed (usually the mutated endpoint path). Consumers
  // may ignore it; it exists so a screen can skip refreshes it knows are unrelated.
  scope?: string;
  at: number;
};

type DataRefreshListener = (event: DataRefreshEvent) => void;

// Cross-tab channel name. Any tab of this app on the same origin joins it.
const BROADCAST_CHANNEL_NAME = "erp-data-refresh";
// localStorage key used when BroadcastChannel is unavailable; the `storage` event
// is what other tabs actually react to, the value only carries the payload.
const BROADCAST_STORAGE_KEY = "erp_data_refresh_ping";
// Browser signals (focus/visible) fire in bursts - one alt-tab can emit several.
// Collapse them so subscribers see a single event.
const BROWSER_SIGNAL_COALESCE_MS = 1_000;

const listeners = new Set<DataRefreshListener>();

let installed = false;
let broadcastChannel: BroadcastChannel | null = null;
let lastBrowserSignalAt = 0;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function emit(event: DataRefreshEvent): void {
  // Copy first: a listener may unsubscribe itself while we iterate.
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // A failing screen must not stop the rest of the app from refreshing.
    }
  }
}

function emitBrowserSignal(reason: DataRefreshReason): void {
  const now = Date.now();
  if (now - lastBrowserSignalAt < BROWSER_SIGNAL_COALESCE_MS) {
    return;
  }
  lastBrowserSignalAt = now;
  emit({ reason, at: now });
}

function readBroadcastScope(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const scope = (data as { scope?: unknown }).scope;
  return typeof scope === "string" && scope.trim() ? scope : undefined;
}

function handleRemoteMutation(data: unknown): void {
  emit({ reason: "remote-mutation", scope: readBroadcastScope(data), at: Date.now() });
}

function openBroadcastChannel(): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      handleRemoteMutation(event.data);
    };
  } catch {
    broadcastChannel = null;
  }
}

function installBrowserListeners(): void {
  if (installed || !canUseDom()) {
    return;
  }
  installed = true;
  window.addEventListener("focus", () => {
    emitBrowserSignal("focus");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      emitBrowserSignal("visible");
    }
  });
  window.addEventListener("online", () => {
    // Not coalesced with focus/visible: coming back online is worth its own pass.
    emit({ reason: "reconnect", at: Date.now() });
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== BROADCAST_STORAGE_KEY || !event.newValue) {
      return;
    }
    try {
      handleRemoteMutation(JSON.parse(event.newValue));
    } catch {
      handleRemoteMutation(null);
    }
  });
  openBroadcastChannel();
}

function broadcastToOtherTabs(scope?: string): void {
  const payload = { scope, at: Date.now() };
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(payload);
      return;
    } catch {
      // Fall through to the storage ping.
    }
  }
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    // Writing is the signal; other tabs get it through the `storage` event.
    window.localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be blocked or full; same-tab refreshing still works.
  }
}

// Subscribe to every refresh signal. Returns the unsubscribe function.
export function subscribeDataRefresh(listener: DataRefreshListener): () => void {
  installBrowserListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Call after a successful write so this tab AND every other open tab re-read.
export function notifyDataChanged(scope?: string): void {
  installBrowserListeners();
  emit({ reason: "mutation", scope, at: Date.now() });
  broadcastToOtherTabs(scope);
}

// Ask every subscriber to re-read now (e.g. a manual "Refresh" button). Stays in
// this tab - other tabs have no reason to refetch because nothing changed.
export function requestDataRefresh(scope?: string): void {
  installBrowserListeners();
  emit({ reason: "manual", scope, at: Date.now() });
}

// Test seam: drop every subscriber and the coalescing window.
export function resetDataRefreshBusForTests(): void {
  listeners.clear();
  lastBrowserSignalAt = 0;
}
