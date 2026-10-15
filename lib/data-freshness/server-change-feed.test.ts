import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRelayThrottle,
  readServerSentEvents,
  startServerChangeFeed,
  type ServerFeedEvent,
} from "./server-change-feed";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

// A stream that stays open until the test closes it, like a live feed.
function openStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    body,
    send: (frame: string) => controller.enqueue(encoder.encode(frame)),
    close: () => controller.close(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("readServerSentEvents", () => {
  it("parses named events, frames split across chunks, CRLF and comments", async () => {
    const events: ServerFeedEvent[] = [];

    await readServerSentEvents(
      streamOf([
        'event: ready\ndata: {"bootId":"b1"}\n\n: keep-alive comment\n\nevent: cha',
        'nge\r\ndata: {"resource":"customers"}\r\n\r\n',
        "data: line one\ndata: line two\n\n",
      ]),
      (event) => events.push(event),
    );

    expect(events).toEqual([
      { type: "ready", data: '{"bootId":"b1"}' },
      { type: "change", data: '{"resource":"customers"}' },
      { type: "message", data: "line one\nline two" },
    ]);
  });
});

describe("createRelayThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the first change at once and folds a burst into one trailing pass", () => {
    const run = vi.fn();
    const relay = createRelayThrottle(run, 1_000);

    relay.push("server:a");
    relay.push("server:b");
    relay.push("server:c");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith("server:a");

    vi.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("server:c");

    vi.advanceTimersByTime(5_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs nothing more once cancelled", () => {
    const run = vi.fn();
    const relay = createRelayThrottle(run, 1_000);
    relay.push("server:a");
    relay.push("server:b");

    relay.cancel();
    vi.advanceTimersByTime(5_000);

    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("startServerChangeFeed", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects with the bearer token and relays other sessions' changes", async () => {
    const feed = openStream();
    const fetchImpl = vi.fn(async () => new Response(feed.body, { status: 200 }));
    const onChange = vi.fn();

    const stop = startServerChangeFeed({
      url: "https://api.test/api/v1/data-changes/stream",
      getAuthorization: () => "Bearer t1",
      fetchImpl,
      onChange,
      locks: null,
    });
    await flush();
    feed.send('event: ready\ndata: {"bootId":"b1"}\n\n');
    feed.send('event: change\ndata: {"resource":"customers","method":"POST"}\n\n');
    await flush();
    stop();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/data-changes/stream");
    expect(init.headers).toMatchObject({ Authorization: "Bearer t1", Accept: "text/event-stream" });
    // The first `ready` is the initial connect: nothing to catch up on.
    expect(onChange.mock.calls).toEqual([["server:customers"]]);
  });

  it("re-reads once after reconnecting to the same server boot, not after a restart", async () => {
    vi.useFakeTimers();
    try {
      const frames = [
        ['event: ready\ndata: {"bootId":"b1"}\n\n'],
        // Dropped and back on the same process: writes may have been missed.
        ['event: ready\ndata: {"bootId":"b1"}\n\n'],
        // The server restarted: nothing was written while it was down.
        ['event: ready\ndata: {"bootId":"b2"}\n\n'],
      ];
      let call = 0;
      const fetchImpl = vi.fn(async () => new Response(streamOf(frames[call++] ?? []), { status: 200 }));
      const onChange = vi.fn();

      const stop = startServerChangeFeed({
        url: "https://api.test/stream",
        getAuthorization: () => "Bearer t1",
        fetchImpl,
        onChange,
        locks: null,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      stop();

      expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(onChange.mock.calls).toEqual([["server:reconnect"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off instead of hammering a server that refuses the token", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

      const stop = startServerChangeFeed({
        url: "https://api.test/stream",
        getAuthorization: () => "Bearer expired",
        fetchImpl,
        onChange: vi.fn(),
        locks: null,
      });
      // Retries at +1 s, +2 s, +4 s, +8 s, +16 s: six attempts in the first 31 s.
      await vi.advanceTimersByTimeAsync(31_500);
      stop();

      expect(fetchImpl).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for a token instead of connecting without one", async () => {
    const fetchImpl = vi.fn();

    const stop = startServerChangeFeed({
      url: "https://api.test/stream",
      getAuthorization: () => null,
      fetchImpl,
      onChange: vi.fn(),
      locks: null,
    });
    await flush();
    stop();

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
