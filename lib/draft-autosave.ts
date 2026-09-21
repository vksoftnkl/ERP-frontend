/**
 * Crash recovery for entry screens — one snapshot per device, in IndexedDB.
 *
 * Sale Bill Entry wrote this first (§12 of its plan) and Quotation Entry wants
 * the same offer back after a counter dies mid-document, so the store itself
 * lives here and neither screen owns it. What is generic is only the plumbing:
 *
 *  - **Keyed by device.** One snapshot per browser profile, overwritten in
 *    place. A counter recovers what IT was on, never another till's work.
 *  - **Scope-checked on the way out.** A snapshot taken under another company /
 *    branch / accounting year is not offered back, because re-tenanting a
 *    half-keyed document would leave one company's prices on a document stamped
 *    for another.
 *  - **Never fatal.** Private browsing, blocked storage and quota policies all
 *    resolve to "no snapshot": recovery is a convenience, and its absence must
 *    never stop a screen opening or an edit committing.
 *
 * What is NOT generic — which drafts are worth keeping, and how a snapshot comes
 * back as an editable draft — stays with the screen, next to the shape it knows.
 *
 * Each screen names its own database, so the two never share a record and a
 * change to one screen's snapshot shape cannot strand the other's.
 */

/** The tenant a snapshot was taken under, and the one it may be offered into. */
export type AutosaveScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

/** What every stored snapshot carries, whatever screen wrote it. */
export type AutosaveRecord = AutosaveScope & {
  /** The device this was taken on — the record's own key. */
  deviceId: string;
  savedAt: string;
};

export type AutosaveStore<T extends AutosaveRecord> = {
  /** Overwrite this device's snapshot. A blank device id is a no-op. */
  write: (record: T) => Promise<void>;
  /** The snapshot this device left behind under that scope, or `null`. */
  read: (deviceId: string, scope: AutosaveScope) => Promise<T | null>;
  /** Drop it — on save, on hold, and on a declined offer. */
  clear: (deviceId: string) => Promise<void>;
};

const STORE_NAME = "autosave";
const DB_VERSION = 1;

function openDb(dbName: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "deviceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore<T>(
  dbName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb(dbName).then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        } catch {
          db.close();
          resolve(null);
          return;
        }
        request.onsuccess = () => {
          resolve(request.result ?? null);
          db.close();
        };
        request.onerror = () => {
          resolve(null);
          db.close();
        };
      }),
  );
}

/**
 * The snapshot store for one screen's database.
 *
 * `dbName` is part of the contract, not a detail: it is what an existing
 * snapshot was written under, so renaming one orphans every counter's recovery.
 */
export function createAutosaveStore<T extends AutosaveRecord>(dbName: string): AutosaveStore<T> {
  return {
    async write(record: T): Promise<void> {
      if (!record.deviceId) {
        return;
      }
      await withStore(dbName, "readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
    },
    async read(deviceId: string, scope: AutosaveScope): Promise<T | null> {
      if (!deviceId) {
        return null;
      }
      const record = await withStore<T>(dbName, "readonly", (store) =>
        store.get(deviceId) as IDBRequest<T>,
      );
      if (!record) {
        return null;
      }
      if (
        record.companyId !== scope.companyId ||
        record.branchId !== scope.branchId ||
        record.accYear !== scope.accYear
      ) {
        return null;
      }
      return record;
    },
    async clear(deviceId: string): Promise<void> {
      if (!deviceId) {
        return;
      }
      await withStore(dbName, "readwrite", (store) => store.delete(deviceId) as IDBRequest<undefined>);
    },
  };
}
