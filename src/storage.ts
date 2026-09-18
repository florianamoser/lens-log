import { DEFAULT_LENSES } from './defaults';
import { createId } from './id';
import type {
  AppSettings, Entry, IncrementalSyncResponse, Lens, LensLogBackup, SyncChange,
  SyncEntity, SyncEntityType, SyncMutation, SyncPayload,
} from './types';

const DB_NAME = 'lens-log';
const DB_VERSION = 3;
const MUTATION_BATCH_SIZE = 100;

type StoreName = 'entries' | 'lenses' | 'settings';
type SyncMeta = { id: 'sync'; deviceId: string; serverInstanceId?: string; lastRevision: number; protocolInitialized: boolean };

const STORE_FOR_ENTITY: Record<SyncEntityType, StoreName> = {
  entry: 'entries', lens: 'lenses', settings: 'settings',
};

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('lenses')) db.createObjectStore('lenses', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('mutations')) db.createObjectStore('mutations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all<T>(storeName: string) {
  const db = await openDatabase();
  try {
    return await requestValue(db.transaction(storeName).objectStore(storeName).getAll()) as T[];
  } finally {
    db.close();
  }
}

function withoutSyncMetadata<T extends SyncEntity>(value: T): T {
  const { syncedAt: _syncedAt, serverRevision: _serverRevision, ...record } = value;
  return record as T;
}

async function putLocal<T extends SyncEntity>(storeName: StoreName, entityType: SyncEntityType, values: T[], mode: SyncMutation['mode'] = 'upsert') {
  if (!values.length) return;
  const db = await openDatabase();
  const transaction = db.transaction([storeName, 'mutations'], 'readwrite');
  const records = transaction.objectStore(storeName);
  const mutations = transaction.objectStore('mutations');
  try {
    const pending = await requestValue(mutations.getAll()) as SyncMutation[];
    for (const value of values) {
      const record = withoutSyncMetadata(value);
      records.put(record);
      pending.filter((item) => item.entityType === entityType && item.entityId === value.id).forEach((item) => mutations.delete(item.id));
      mutations.put({
        id: createId(), entityType, entityId: value.id, value: record,
        createdAt: new Date().toISOString(), mode,
      } satisfies SyncMutation);
    }
    await transactionDone(transaction);
  } catch (error) {
    console.error(`[indexeddb] ${storeName} write failed:`, error);
    try { transaction.abort(); } catch { /* transaction already closed */ }
    throw error;
  } finally {
    db.close();
  }
}

async function getSyncMeta(): Promise<SyncMeta> {
  const db = await openDatabase();
  try {
    const stored = await requestValue(db.transaction('meta').objectStore('meta').get('sync')) as SyncMeta | undefined;
    if (stored) return stored;
  } finally {
    db.close();
  }
  const created: SyncMeta = { id: 'sync', deviceId: createId(), lastRevision: 0, protocolInitialized: false };
  const writeDb = await openDatabase();
  const transaction = writeDb.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put(created);
  await transactionDone(transaction);
  writeDb.close();
  return created;
}

async function saveSyncMeta(meta: SyncMeta) {
  const db = await openDatabase();
  const transaction = db.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put(meta);
  await transactionDone(transaction);
  db.close();
}

async function initializeProtocol() {
  const meta = await getSyncMeta();
  if (meta.protocolInitialized) return;
  const [entries, lenses, settings] = await Promise.all([getEntries(), getLenses(), getSettings()]);
  await putLocal('entries', 'entry', entries, 'bootstrap');
  await putLocal('lenses', 'lens', lenses, 'bootstrap');
  await putLocal('settings', 'settings', settings, 'bootstrap');
  await saveSyncMeta({ ...meta, protocolInitialized: true });
}

export async function initializeStore() {
  await initializeProtocol();
  const lenses = await getLenses();
  const existingIds = new Set(lenses.map((lens) => lens.id));
  const missingDefaults = DEFAULT_LENSES.filter((lens) => !existingIds.has(lens.id));
  const revisedDefaults = lenses.flatMap((lens) => {
    const currentDefault = DEFAULT_LENSES.find((candidate) => candidate.id === lens.id);
    if (!currentDefault) return [];
    const unchanged = lens.short === currentDefault.short
      && lens.name === currentDefault.name
      && JSON.stringify(lens.apertures) === JSON.stringify(currentDefault.apertures);
    if (unchanged) return [];
    return [{ ...lens, short: currentDefault.short, name: currentDefault.name, apertures: currentDefault.apertures, builtIn: true, updatedAt: new Date().toISOString(), syncedAt: undefined }];
  });
  if (missingDefaults.length || revisedDefaults.length) await saveLenses([...missingDefaults, ...revisedDefaults]);
}

export const getEntries = () => all<Entry>('entries');
export const getLenses = () => all<Lens>('lenses');
export const getSettings = () => all<AppSettings>('settings');
export const getMutations = () => all<SyncMutation>('mutations');
export const saveEntry = (entry: Entry) => putLocal('entries', 'entry', [entry]);
export const saveEntries = (entries: Entry[]) => putLocal('entries', 'entry', entries);
export const saveLens = (lens: Lens) => putLocal('lenses', 'lens', [lens]);
export const saveLenses = (lenses: Lens[]) => putLocal('lenses', 'lens', lenses);
export const saveSettings = (settings: AppSettings) => putLocal('settings', 'settings', [settings]);

async function applySyncResponse(response: IncrementalSyncResponse) {
  const db = await openDatabase();
  const transaction = db.transaction(['entries', 'lenses', 'settings', 'mutations', 'meta'], 'readwrite');
  const mutationStore = transaction.objectStore('mutations');
  try {
    const currentMutations = await requestValue(mutationStore.getAll()) as SyncMutation[];
    const acknowledged = new Set(response.acknowledgedMutationIds);
    const locallyPending = new Set(currentMutations
      .filter((mutation) => !acknowledged.has(mutation.id))
      .map((mutation) => `${mutation.entityType}:${mutation.entityId}`));

    response.acknowledgedMutationIds.forEach((id) => mutationStore.delete(id));
    [...response.changes].sort((a, b) => a.revision - b.revision).forEach((change: SyncChange) => {
      if (locallyPending.has(`${change.entityType}:${change.entityId}`)) return;
      transaction.objectStore(STORE_FOR_ENTITY[change.entityType]).put({
        ...change.value, syncedAt: change.serverUpdatedAt, serverRevision: change.revision,
      });
    });

    const existingMeta = await requestValue(transaction.objectStore('meta').get('sync')) as SyncMeta;
    transaction.objectStore('meta').put({ ...existingMeta, serverInstanceId: response.serverInstanceId, lastRevision: response.revision, protocolInitialized: true });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function syncStore(): Promise<SyncPayload> {
  let firstRequest = true;
  for (let requestNumber = 0; requestNumber < 1000; requestNumber += 1) {
    const [meta, pending] = await Promise.all([getSyncMeta(), getMutations()]);
    const batch = pending.slice(0, MUTATION_BATCH_SIZE);
    if (firstRequest) console.info(`[sync] pending mutations: ${pending.length}`);
    console.info(`[sync] POST /api/sync from revision ${meta.lastRevision}`);
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: meta.deviceId, serverInstanceId: meta.serverInstanceId, sinceRevision: meta.lastRevision, mutations: batch }),
    });
    if (!response.ok) throw new Error(`Sync failed (${response.status})`);
    const result = await response.json() as IncrementalSyncResponse;
    if (meta.serverInstanceId && meta.serverInstanceId !== result.serverInstanceId) {
      const [entries, lenses, settings] = await Promise.all([getEntries(), getLenses(), getSettings()]);
      await putLocal('entries', 'entry', entries, 'bootstrap');
      await putLocal('lenses', 'lens', lenses, 'bootstrap');
      await putLocal('settings', 'settings', settings, 'bootstrap');
      await saveSyncMeta({ ...meta, serverInstanceId: result.serverInstanceId, lastRevision: 0, protocolInitialized: true });
      console.info('[sync] server identity changed; local records queued for recovery');
      continue;
    }
    await applySyncResponse(result);
    console.info(`[sync] acknowledged mutations: ${result.acknowledgedMutationIds.length}; received changes: ${result.changes.length}`);
    firstRequest = false;
    const remaining = await getMutations();
    if (batch.length && !result.acknowledgedMutationIds.some((id) => batch.some((mutation) => mutation.id === id))) {
      throw new Error('Sync response did not acknowledge the submitted mutations');
    }
    if (!result.hasMore && !remaining.length) break;
    if (requestNumber === 999) throw new Error('Sync did not converge');
  }
  const [entries, lenses, settings] = await Promise.all([getEntries(), getLenses(), getSettings()]);
  return { entries, lenses, settings };
}

function isBackup(value: unknown): value is LensLogBackup {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Partial<LensLogBackup>;
  return backup.format === 'lens-log-backup' && backup.formatVersion === 1
    && Array.isArray(backup.entries) && Array.isArray(backup.lenses) && Array.isArray(backup.settings);
}

export async function createBackup(appVersion: string): Promise<LensLogBackup> {
  const [entries, lenses, settings] = await Promise.all([getEntries(), getLenses(), getSettings()]);
  return { format: 'lens-log-backup', formatVersion: 1, appVersion, exportedAt: new Date().toISOString(), entries, lenses, settings };
}

export async function restoreBackup(value: unknown) {
  if (!isBackup(value)) throw new Error('This is not a valid Lens Log backup.');
  const db = await openDatabase();
  const transaction = db.transaction(['entries', 'lenses', 'settings', 'mutations', 'meta'], 'readwrite');
  try {
    const entries = transaction.objectStore('entries');
    const lenses = transaction.objectStore('lenses');
    const settings = transaction.objectStore('settings');
    const mutations = transaction.objectStore('mutations');
    entries.clear(); lenses.clear(); settings.clear(); mutations.clear();
    const now = new Date().toISOString();
    const queue = (entityType: SyncEntityType, records: SyncEntity[]) => records.forEach((record) => {
      const clean = withoutSyncMetadata(record);
      transaction.objectStore(STORE_FOR_ENTITY[entityType]).put(clean);
      mutations.put({ id: createId(), entityType, entityId: record.id, value: clean, createdAt: now, mode: 'upsert' } satisfies SyncMutation);
    });
    queue('entry', value.entries);
    queue('lens', value.lenses);
    queue('settings', value.settings);
    const existingMeta = await requestValue(transaction.objectStore('meta').get('sync')) as SyncMeta | undefined;
    transaction.objectStore('meta').put({
      id: 'sync', deviceId: existingMeta?.deviceId ?? createId(), lastRevision: 0, protocolInitialized: true,
    } satisfies SyncMeta);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
