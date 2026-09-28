import { describe, expect, it } from "vitest";
import { LIVE_MENU_TREE_PAYLOAD, LIVE_USER_MENUS } from "./fixtures";
import { describeRevocations, grantDiff, revokesAnything } from "./grantDiff";
import { grantsFromPayload, setFlag, tickMenu } from "./grants";
import { parseMenuTree } from "./menuTree";

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });
const loaded = grantsFromPayload(LIVE_USER_MENUS);
const nameOf = (menuId: number) => tree.byId.get(menuId)?.label ?? `#${menuId}`;

describe("grantDiff", () => {
  it("finds nothing between a set and itself", () => {
    const diff = grantDiff(loaded, grantsFromPayload(LIVE_USER_MENUS));
    expect(diff.changed).toBe(false);
    expect(revokesAnything(diff)).toBe(false);
    expect(describeRevocations(diff, nameOf)).toBeNull();
  });

  it("counts and names grants, revokes and flag-level changes", () => {
    // Revoke menu 10, grant menu 8, and on 249 drop Print and add Post (which
    // the fixture user does not hold there).
    let current = tickMenu(loaded, tree.byId.get(10)!, false, loaded);
    current = setFlag(current, 8, "umCanView", true, loaded);
    current = setFlag(current, 249, "umCanPrint", false, loaded);
    current = setFlag(current, 249, "umCanPost", true, loaded);

    const diff = grantDiff(loaded, current);
    expect(diff.revoked).toEqual([10]);
    expect(diff.granted).toEqual([8]);
    expect(diff.flagsRemoved).toEqual([{ menuId: 249, key: "umCanPrint" }]);
    expect(diff.flagsAdded).toEqual([{ menuId: 249, key: "umCanPost" }]);
    expect(diff.changed).toBe(true);
    expect(revokesAnything(diff)).toBe(true);
  });

  it("does not double-count the flags of a revoked menu", () => {
    const current = tickMenu(loaded, tree.byId.get(249)!, false, loaded);
    const diff = grantDiff(loaded, current);
    expect(diff.revoked).toEqual([249]);
    expect(diff.flagsRemoved).toEqual([]);
  });

  it("a grant alone is a change but not a revocation", () => {
    const current = setFlag(loaded, 249, "umCanPost", true, loaded);
    const diff = grantDiff(loaded, current);
    expect(diff.changed).toBe(true);
    expect(revokesAnything(diff)).toBe(false);
  });
});

describe("describeRevocations", () => {
  it("names the revoked menus and counts the flags per verb", () => {
    let current = tickMenu(loaded, tree.byId.get(249)!, false, loaded);
    current = tickMenu(current, tree.byId.get(250)!, false, loaded);
    current = setFlag(current, 10, "umCanEdit", false, loaded);
    current = setFlag(current, 12, "umCanEdit", false, loaded);
    current = setFlag(current, 12, "umCanDelete", false, loaded);
    const sentence = describeRevocations(grantDiff(loaded, current), nameOf);
    expect(sentence).toBe(
      "This save removes access to 2 menus: Stock Track Policy and Ledger mapping, " +
        "and removes Edit on 2 menus and Delete on 1 menu. Continue?",
    );
  });

  it("names at most six menus and says how many more", () => {
    let current = loaded;
    const ids = [...loaded.keys()].slice(0, 9);
    for (const id of ids) current = tickMenu(current, tree.byId.get(id)!, false, loaded);
    const diff = grantDiff(loaded, current);
    expect(diff.revoked.length).toBeGreaterThanOrEqual(9);
    const sentence = describeRevocations(diff, nameOf)!;
    expect(sentence).toMatch(/^This save removes access to \d+ menus: /);
    expect(sentence).toMatch(/ and \d+ more\. Continue\?$/);
    expect(sentence.split(", ").length).toBeLessThanOrEqual(7);
  });

  it("speaks only of flags when no menu is revoked", () => {
    const current = setFlag(loaded, 12, "umCanView", false, loaded);
    expect(describeRevocations(grantDiff(loaded, current), nameOf)).toBe(
      "This save removes View on 1 menu. Continue?",
    );
  });
});
