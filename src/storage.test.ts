import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';
import {
  createBackup, getEntries, getMutations, getSettings, initializeStore, restoreBackup,
  saveEntry, saveSettings, syncStore,
} from './storage';
import type { AppSettings, Entry, IncrementalSyncResponse, SyncChange, SyncMutation } from './types';

const serverInstanceId = 'server-instance-1';
let revision = 0;

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1', frameNumber: '9999', lensId: 'c645-35',
    lensName: 'Contax 645 · Carl Zeiss Distagon T* 3.5/35', lensShort: '35', aperture: '11',
    shiftX: 1.25, shiftY: -2.5, shiftProfile: 'pico',
    createdAt: '2029-01-01T12:00:00.000Z', updatedAt: '2029-01-01T12:00:00.000Z', deleted: false,
    ...overrides,
  };
}

function response(value: Partial<IncrementalSyncResponse> = {}) {
  const payload: IncrementalSyncResponse = {
    serverInstanceId, acknowledgedMutationIds: [], changes: [], revision,
    latestRevision: revision, hasMore: false, ...value,
  };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

function acknowledgeAll() {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { mutations: SyncMutation[] };
    const changes: SyncChange[] = request.mutations.map((mutation) => ({
      revision: ++revision, entityType: mutation.entityType, entityId: mutation.entityId,
      value: mutation.value, serverUpdatedAt: `2030-01-01T00:00:${String(revision).padStart(2, '0')}.000Z`,
    }));
    return response({
      acknowledgedMutationIds: request.mutations.map((mutation) => mutation.id), changes,
      revision, latestRevision: revision,
    });
  }));
}

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lens-log');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Test database deletion was blocked'));
  });
}

beforeEach(async () => {
  revision = 0;
  await deleteDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('durable mutation queue', () => {
  it('atomically stores a new entry and a pending mutation', async () => {
    const saved = entry();
    await saveEntry(saved);
    await expect(getEntries()).resolves.toEqual([saved]);
    const mutations = await getMutations();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ entityType: 'entry', entityId: saved.id, value: saved });
  });

  it('coalesces repeated unsynchronised changes to the same record', async () => {
    await saveEntry(entry());
    await saveEntry(entry({ aperture: '8', updatedAt: '2029-01-02T00:00:00.000Z' }));
    const mutations = await getMutations();
    expect(mutations).toHaveLength(1);
    expect((mutations[0].value as Entry).aperture).toBe('8');
  });

  it('keeps both the record and mutation when synchronization fails', async () => {
    const saved = entry();
    await saveEntry(saved);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    await expect(syncStore()).rejects.toThrow('Sync failed (503)');
    await expect(getEntries()).resolves.toEqual([saved]);
    await expect(getMutations()).resolves.toHaveLength(1);
  });

  it('does not mistake an empty successful response for a saved mutation', async () => {
    const saved = entry();
    await saveEntry(saved);
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    await expect(syncStore()).rejects.toThrow('did not acknowledge');
    await expect(getEntries()).resolves.toEqual([saved]);
    await expect(getMutations()).resolves.toHaveLength(1);
  });
});

describe('incremental revision synchronization', () => {
  it('posts queued mutations instead of the complete local database', async () => {
    await saveEntry(entry());
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      const mutations = body.mutations as SyncMutation[];
      revision = 1;
      return response({
        acknowledgedMutationIds: mutations.map((mutation) => mutation.id),
        changes: [{ revision, entityType: 'entry', entityId: 'entry-1', value: entry(), serverUpdatedAt: '2030-01-01T00:00:00.000Z' }],
        revision, latestRevision: revision,
      });
    }));
    await syncStore();
    expect(body).toHaveProperty('sinceRevision', 0);
    expect(body).toHaveProperty('deviceId');
    expect(body).not.toHaveProperty('entries');
    expect((body.mutations as unknown[])).toHaveLength(1);
  });

  it('acknowledges a mutation without removing its local record', async () => {
    await saveEntry(entry());
    acknowledgeAll();
    const result = await syncStore();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'entry-1', serverRevision: 1 });
    await expect(getMutations()).resolves.toHaveLength(0);
  });

  it('applies later server revisions to settings', async () => {
    const local: AppSettings = { id: 'current', lensId: 'c645-35', aperture: '11', shiftProfile: 'pico', updatedAt: '2029-01-01T00:00:00.000Z' };
    await saveSettings(local);
    acknowledgeAll();
    await syncStore();
    const remote: AppSettings = { ...local, lensId: 'c645-55', aperture: '8', shiftProfile: 'alpa', updatedAt: '2028-01-01T00:00:00.000Z' };
    revision += 1;
    vi.stubGlobal('fetch', vi.fn(async () => response({
      changes: [{ revision, entityType: 'settings', entityId: 'current', value: remote, serverUpdatedAt: '2030-01-02T00:00:00.000Z' }],
      revision, latestRevision: revision,
    })));
    const result = await syncStore();
    expect(result.settings[0]).toMatchObject({ lensId: 'c645-55', aperture: '8', shiftProfile: 'alpa', serverRevision: 2 });
  });

  it('keeps a newer local pending change over a downloaded server change', async () => {
    await saveEntry(entry({ aperture: '8' }));
    const pending = await getMutations();
    revision = 1;
    vi.stubGlobal('fetch', vi.fn(async () => response({
      acknowledgedMutationIds: [],
      changes: [{ revision, entityType: 'entry', entityId: 'entry-1', value: entry({ aperture: '16' }), serverUpdatedAt: '2030-01-01T00:00:00.000Z' }],
      revision, latestRevision: revision,
    })));
    await expect(syncStore()).rejects.toThrow('did not acknowledge');
    expect((await getEntries())[0].aperture).toBe('8');
    expect((await getMutations())[0].id).toBe(pending[0].id);
  });
});

describe('backup and migration safety', () => {
  it('exports and restores entries and settings, rebuilding their mutation queue', async () => {
    const saved = entry();
    const settings: AppSettings = { id: 'current', lensId: 'c645-35', aperture: '11', shiftProfile: 'pico', updatedAt: '2029-01-01T00:00:00.000Z' };
    await saveEntry(saved);
    await saveSettings(settings);
    const backup = await createBackup('1.2.3');
    await saveEntry(entry({ id: 'entry-2', frameNumber: '0002' }));
    await restoreBackup(backup);
    await expect(getEntries()).resolves.toEqual([saved]);
    await expect(getSettings()).resolves.toEqual([settings]);
    expect(await getMutations()).toHaveLength(2);
  });

  it('rejects malformed backup files without clearing local data', async () => {
    const saved = entry();
    await saveEntry(saved);
    await expect(restoreBackup({ entries: [] })).rejects.toThrow('not a valid Lens Log backup');
    await expect(getEntries()).resolves.toEqual([saved]);
  });

  it('upgrades an IndexedDB v2 database without losing its entries', async () => {
    const saved = entry();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lens-log', 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('entries', { keyPath: 'id' }).put(saved);
        request.result.createObjectStore('lenses', { keyPath: 'id' });
        request.result.createObjectStore('settings', { keyPath: 'id' });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await initializeStore();
    expect((await getEntries())[0]).toEqual(saved);
    expect((await getMutations()).some((mutation) => mutation.entityType === 'entry' && mutation.entityId === saved.id)).toBe(true);
  });

  it('creates a UUID when randomUUID is unavailable on an HTTP origin', () => {
    let value = 0;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(value += 1) });
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
