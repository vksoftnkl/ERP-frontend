import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyDataChanged,
  requestDataRefresh,
  resetDataRefreshBusForTests,
  subscribeDataRefresh,
  type DataRefreshEvent,
} from "./refresh-bus";

afterEach(() => {
  resetDataRefreshBusForTests();
});

describe("data refresh bus", () => {
  it("tells every subscriber that a save happened, with the scope that changed", () => {
    const events: DataRefreshEvent[] = [];
    const other = vi.fn();
    subscribeDataRefresh((event) => events.push(event));
    subscribeDataRefresh(other);

    notifyDataChanged("/item-masters/save");

    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe("mutation");
    expect(events[0]?.scope).toBe("/item-masters/save");
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("marks an explicit refresh as manual", () => {
    const listener = vi.fn();
    subscribeDataRefresh(listener);

    requestDataRefresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ reason: "manual" });
  });

  it("stops delivering once a subscriber unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDataRefresh(listener);

    notifyDataChanged();
    unsubscribe();
    notifyDataChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps refreshing the other screens when one subscriber throws", () => {
    const healthy = vi.fn();
    subscribeDataRefresh(() => {
      throw new Error("one screen failed to refresh");
    });
    subscribeDataRefresh(healthy);

    expect(() => notifyDataChanged()).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("lets a subscriber unsubscribe from inside its own handler", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDataRefresh(() => {
      unsubscribe();
    });
    subscribeDataRefresh(listener);

    expect(() => notifyDataChanged()).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
