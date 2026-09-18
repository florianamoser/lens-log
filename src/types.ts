export type Lens = {
  id: string;
  short: string;
  name: string;
  apertures: string[];
  active: boolean;
  builtIn?: boolean;
  deleted?: boolean;
  updatedAt: string;
  syncedAt?: string;
  serverRevision?: number;
};

export type ShiftProfile = 'c1' | 'alpa' | 'pico';

export type AppSettings = {
  id: 'current';
  lensId: string;
  aperture: string;
  shiftProfile: ShiftProfile;
  updatedAt: string;
  syncedAt?: string;
  serverRevision?: number;
};

export type Entry = {
  id: string;
  frameNumber: string;
  lensId: string;
  lensName: string;
  lensShort: string;
  aperture: string;
  shiftX: number;
  shiftY: number;
  shiftProfile?: ShiftProfile;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  syncedAt?: string;
  serverRevision?: number;
};

export type SyncPayload = { entries: Entry[]; lenses: Lens[]; settings: AppSettings[] };

export type SyncEntityType = 'entry' | 'lens' | 'settings';
export type SyncEntity = Entry | Lens | AppSettings;

export type SyncMutation = {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  value: SyncEntity;
  createdAt: string;
  mode: 'upsert' | 'bootstrap';
};

export type SyncChange = {
  revision: number;
  entityType: SyncEntityType;
  entityId: string;
  value: SyncEntity;
  serverUpdatedAt: string;
};

export type IncrementalSyncResponse = {
  serverInstanceId: string;
  acknowledgedMutationIds: string[];
  changes: SyncChange[];
  revision: number;
  latestRevision: number;
  hasMore: boolean;
};

export type LensLogBackup = SyncPayload & {
  format: 'lens-log-backup';
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
};
