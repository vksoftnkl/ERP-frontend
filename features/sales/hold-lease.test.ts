import { describe, expect, it } from "vitest";
import type { TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import { decideHoldLease, verifyHoldLease } from "./hold-lease";

const DEVICE = "55555555-5555-5555-5555-555555555555";
const OTHER = "66666666-6666-6666-6666-666666666666";
const NOW = new Date("2026-10-16T10:00:00Z");
const LIVE = "2026-10-16T10:30:00Z";
const LAPSED = "2026-10-16T09:30:00Z";

function hold(overrides: Partial<TxnHoldPayload> = {}): TxnHoldPayload {
  return {
    txhId: "txh-1",
    txhCompanyId: "co",
    txhBranchId: "br",
    txhAccYear: "2026-2027",
    txhHoldNo: "H-7",
    txhStatus: "LOCKED",
    txhLockedDeviceId: DEVICE,
    txhLockExpiresOn: LIVE,
    txhConvertedDocId: null,
    ...overrides,
  } as TxnHoldPayload;
}

describe("decideHoldLease", () => {
  it.each([
    ["still ours", hold(), "held"],
    ["ours, lease lapsed", hold({ txhLockExpiresOn: LAPSED }), "retake"],
    ["freed", hold({ txhStatus: "HELD", txhLockedDeviceId: null, txhLockExpiresOn: null }), "retake"],
    ["another device's live lease", hold({ txhLockedDeviceId: OTHER }), "taken"],
    ["another device's lapsed lease", hold({ txhLockedDeviceId: OTHER, txhLockExpiresOn: LAPSED }), "retake"],
    ["RESUMED through the CRUD route", hold({ txhStatus: "RESUMED", txhLockedDeviceId: null }), "taken"],
    ["converted", hold({ txhStatus: "CONVERTED", txhConvertedDocId: "sb-1" }), "closed"],
    ["discarded", hold({ txhStatus: "CANCELLED" }), "closed"],
  ] as const)("%s → %s", (_label, row, expected) => {
    expect(decideHoldLease(row, DEVICE, NOW)).toBe(expected);
  });
});

describe("verifyHoldLease", () => {
  const base = { txhId: "txh-1", holdNo: "H-7", deviceMasterId: DEVICE, now: NOW };

  it("rebuilds the lease when it is still ours, without re-taking it", async () => {
    let retaken = false;
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => hold(),
      retake: async () => {
        retaken = true;
      },
    });
    expect(outcome).toEqual({
      kind: "held",
      lease: { txhId: "txh-1", holdNo: "H-7", scope: { txhCompanyId: "co", txhBranchId: "br", txhAccYear: "2026-2027" } },
    });
    expect(retaken).toBe(false);
  });

  it("re-takes a lapsed lease", async () => {
    let retaken = false;
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => hold({ txhLockExpiresOn: LAPSED }),
      retake: async () => {
        retaken = true;
      },
    });
    expect(outcome.kind).toBe("held");
    expect(retaken).toBe(true);
  });

  it("detaches a cart another device took over", async () => {
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => hold({ txhLockedDeviceId: OTHER }),
      retake: async () => undefined,
    });
    expect(outcome.kind).toBe("lost");
  });

  it("detaches when the re-take is refused", async () => {
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => hold({ txhStatus: "HELD", txhLockedDeviceId: null }),
      retake: async () => {
        throw { status: 409, data: { message: "taken" } };
      },
    });
    expect(outcome.kind).toBe("lost");
  });

  it("detaches a hold that no longer exists", async () => {
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => {
        throw { status: 404 };
      },
      retake: async () => undefined,
    });
    expect(outcome.kind).toBe("lost");
  });

  it("changes nothing when the read merely failed", async () => {
    const outcome = await verifyHoldLease({
      ...base,
      readHold: async () => {
        throw { status: "FETCH_ERROR" };
      },
      retake: async () => undefined,
    });
    expect(outcome).toEqual({ kind: "unverified" });
  });
});
