import { afterEach, describe, expect, it } from "vitest";
import {
  clearDropdownMasters,
  getDropdownMaster,
  registerDropdownMaster,
  subscribeDropdownMasters,
  unregisterDropdownMaster,
} from "./masters";

const registration = { menuId: 10, render: () => null };

afterEach(() => {
  clearDropdownMasters();
});

describe("the dropdown master registry", () => {
  it("returns null for an unregistered dropdown — which is not an error", () => {
    expect(getDropdownMaster("39")).toBeNull();
  });

  it("registers and resolves by id", () => {
    registerDropdownMaster(39, registration);
    expect(getDropdownMaster("39")).toBe(registration);
  });

  it("treats the numeric and string forms of an id as the same dropdown", () => {
    registerDropdownMaster(39, registration);
    expect(getDropdownMaster(39)).toBe(registration);
    expect(getDropdownMaster(" 39 ")).toBe(registration);
  });

  it("lets a later registration replace an earlier one", () => {
    const replacement = { menuId: 21, render: () => null };
    registerDropdownMaster(39, registration);
    registerDropdownMaster(39, replacement);
    expect(getDropdownMaster(39)).toBe(replacement);
  });

  it("ignores an empty id rather than registering under a blank key", () => {
    registerDropdownMaster("  ", registration);
    expect(getDropdownMaster("")).toBeNull();
  });

  it("unregisters", () => {
    registerDropdownMaster(39, registration);
    unregisterDropdownMaster(39);
    expect(getDropdownMaster(39)).toBeNull();
  });
});

/**
 * A dropdown id is resolved from Dropdown Master BY NAME, so a feature cannot
 * name its dropdown until it has rendered and registers from an effect. Fields
 * already on screen have to hear about that, or a master registered one render
 * too late is indistinguishable from no master at all.
 */
describe("the registry's subscription", () => {
  it("tells a subscriber when a master is registered", () => {
    let calls = 0;
    const unsubscribe = subscribeDropdownMasters(() => {
      calls += 1;
    });
    registerDropdownMaster(39, registration);
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("stays silent when the same registration is re-registered", () => {
    registerDropdownMaster(39, registration);
    let calls = 0;
    const unsubscribe = subscribeDropdownMasters(() => {
      calls += 1;
    });
    // The re-register a render loop would cause: the entry has not changed, so
    // notifying would re-render every subscribed field for nothing.
    registerDropdownMaster(39, registration);
    expect(calls).toBe(0);
    unsubscribe();
  });

  it("tells a subscriber when a registration is replaced or removed", () => {
    const replacement = { menuId: 21, render: () => null };
    registerDropdownMaster(39, registration);
    let calls = 0;
    const unsubscribe = subscribeDropdownMasters(() => {
      calls += 1;
    });
    registerDropdownMaster(39, replacement);
    unregisterDropdownMaster(39);
    expect(calls).toBe(2);
    unsubscribe();
  });

  it("stays silent unregistering a dropdown that was never registered", () => {
    let calls = 0;
    const unsubscribe = subscribeDropdownMasters(() => {
      calls += 1;
    });
    unregisterDropdownMaster(39);
    expect(calls).toBe(0);
    unsubscribe();
  });

  it("stops telling a subscriber that has unsubscribed", () => {
    let calls = 0;
    const unsubscribe = subscribeDropdownMasters(() => {
      calls += 1;
    });
    unsubscribe();
    registerDropdownMaster(39, registration);
    expect(calls).toBe(0);
  });
});
