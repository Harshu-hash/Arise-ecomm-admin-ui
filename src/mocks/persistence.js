import { SNAPSHOT_VERSION, hydrateDb, snapshotDb } from './db/store';

/**
 * Persists the mock database to IndexedDB so a reload keeps whatever you did —
 * approving a seller, editing a role — which is what makes the mock feel like
 * a real backend. localStorage is too small for the seeded order volume.
 */

const DB_NAME = 'arise-admin-mock';
const STORE = 'snapshots';
const KEY = 'current';
const SAVE_DEBOUNCE_MS = 400;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const idb = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

export async function loadSnapshot() {
  try {
    const result = await withStore('readonly', (store) => store.get(KEY));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot() {
  try {
    const snapshot = snapshotDb();
    await withStore('readwrite', (store) => store.put(snapshot, KEY));
    return true;
  } catch {
    // Private mode or a storage quota error: the session still works, it just
    // won't survive a reload.
    return false;
  }
}

export async function clearSnapshot() {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
    return true;
  } catch {
    return false;
  }
}

/**
 * A restored database is only usable if it was written by this build and still
 * contains the records the app cannot work without. Anything else is discarded
 * in favour of a fresh seed — a stale snapshot is never worth more than a
 * working app.
 */
export function snapshotIsUsable(snapshot) {
  if (!snapshot) return { ok: false, reason: 'none' };
  if (snapshot.version !== SNAPSHOT_VERSION) {
    return { ok: false, reason: `version ${snapshot.version ?? 'unknown'} (expected ${SNAPSHOT_VERSION})` };
  }
  const { collections } = snapshot;
  if (!collections?.adminUsers?.length) return { ok: false, reason: 'no admin users' };
  if (!collections?.roles?.length) return { ok: false, reason: 'no roles' };
  // Credentials are what a stale snapshot most visibly breaks, so check one.
  if (!collections.adminUsers.some((u) => u.email && u.password)) {
    return { ok: false, reason: 'admin accounts have no credentials' };
  }
  return { ok: true };
}

export async function restoreIfPresent() {
  const snapshot = await loadSnapshot();
  const usable = snapshotIsUsable(snapshot);

  if (!usable.ok) {
    if (snapshot) {
      // eslint-disable-next-line no-console
      console.warn(`[mock] Discarding saved demo data: ${usable.reason}. Re-seeding.`);
      await clearSnapshot();
    }
    return false;
  }

  hydrateDb(snapshot);
  return true;
}

let timer = null;

/** Called by handlers after every mutation; coalesces bursts into one write. */
export function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void saveSnapshot();
  }, SAVE_DEBOUNCE_MS);
}
