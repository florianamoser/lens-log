import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, unlink, rename, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

const port = Number(process.env.PORT || 6464);
const host = process.env.HOST || '0.0.0.0';
const dataDirectory = process.env.DATA_DIR || join(process.cwd(), 'data');
const publicDirectory = join(process.cwd(), 'dist');
const backupsDirectory = join(dataDirectory, 'backups');
const changePageSize = 250;
const backupRetention = 14;

await mkdir(dataDirectory, { recursive: true });
await mkdir(backupsDirectory, { recursive: true });
const databasePath = join(dataDirectory, 'lens-log.sqlite');
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY, frame_number TEXT NOT NULL, lens_id TEXT NOT NULL, lens_name TEXT NOT NULL,
    lens_short TEXT NOT NULL, aperture TEXT NOT NULL, shift_x REAL NOT NULL, shift_y REAL NOT NULL,
    shift_profile TEXT NOT NULL DEFAULT 'pico', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, server_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lenses (
    id TEXT PRIMARY KEY, short TEXT NOT NULL, name TEXT NOT NULL, apertures TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, built_in INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY, lens_id TEXT NOT NULL, aperture TEXT NOT NULL, shift_profile TEXT NOT NULL,
    updated_at TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS change_log (
    revision INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    payload TEXT NOT NULL, server_updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS applied_mutations (
    id TEXT PRIMARY KEY, revision INTEGER NOT NULL, received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_change_log_entity ON change_log(entity_type, entity_id);
  PRAGMA optimize;
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('lenses', 'deleted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('entries', 'shift_profile', "TEXT NOT NULL DEFAULT 'pico'");
ensureColumn('entries', 'server_revision', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('lenses', 'server_revision', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('settings', 'server_revision', 'INTEGER NOT NULL DEFAULT 0');

const getMeta = db.prepare('SELECT value FROM sync_meta WHERE key = ?');
const setMeta = db.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
let serverInstanceId = getMeta.get('server_instance_id')?.value;
if (!serverInstanceId) {
  serverInstanceId = randomUUID();
  setMeta.run('server_instance_id', serverInstanceId);
}

const upsertEntry = db.prepare(`
  INSERT INTO entries (id, frame_number, lens_id, lens_name, lens_short, aperture, shift_x, shift_y, shift_profile, created_at, updated_at, deleted, server_revision)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET frame_number=excluded.frame_number, lens_id=excluded.lens_id,
    lens_name=excluded.lens_name, lens_short=excluded.lens_short, aperture=excluded.aperture,
    shift_x=excluded.shift_x, shift_y=excluded.shift_y, shift_profile=excluded.shift_profile,
    created_at=excluded.created_at, updated_at=excluded.updated_at, deleted=excluded.deleted,
    server_revision=excluded.server_revision
`);
const upsertLens = db.prepare(`
  INSERT INTO lenses (id, short, name, apertures, active, built_in, deleted, updated_at, server_revision)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET short=excluded.short, name=excluded.name, apertures=excluded.apertures,
    active=excluded.active, built_in=excluded.built_in, deleted=excluded.deleted,
    updated_at=excluded.updated_at, server_revision=excluded.server_revision
`);
const upsertSettings = db.prepare(`
  INSERT INTO settings (id, lens_id, aperture, shift_profile, updated_at, server_revision)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET lens_id=excluded.lens_id, aperture=excluded.aperture,
    shift_profile=excluded.shift_profile, updated_at=excluded.updated_at, server_revision=excluded.server_revision
`);
const insertChange = db.prepare('INSERT INTO change_log (entity_type, entity_id, payload, server_updated_at) VALUES (?, ?, ?, ?)');
const recordMutation = db.prepare('INSERT INTO applied_mutations (id, revision, received_at) VALUES (?, ?, ?)');
const findMutation = db.prepare('SELECT revision FROM applied_mutations WHERE id = ?');

function entryFromRow(row) {
  return { id: row.id, frameNumber: row.frame_number, lensId: row.lens_id, lensName: row.lens_name, lensShort: row.lens_short,
    aperture: row.aperture, shiftX: row.shift_x, shiftY: row.shift_y, shiftProfile: row.shift_profile,
    createdAt: row.created_at, updatedAt: row.updated_at, deleted: Boolean(row.deleted), serverRevision: row.server_revision };
}
function lensFromRow(row) {
  return { id: row.id, short: row.short, name: row.name, apertures: JSON.parse(row.apertures), active: Boolean(row.active),
    builtIn: Boolean(row.built_in), deleted: Boolean(row.deleted), updatedAt: row.updated_at, serverRevision: row.server_revision };
}
function settingsFromRow(row) {
  return { id: row.id, lensId: row.lens_id, aperture: row.aperture, shiftProfile: row.shift_profile,
    updatedAt: row.updated_at, serverRevision: row.server_revision };
}

function allData() {
  return {
    entries: db.prepare('SELECT * FROM entries ORDER BY created_at, id').all().map(entryFromRow),
    lenses: db.prepare('SELECT * FROM lenses ORDER BY rowid').all().map(lensFromRow),
    settings: db.prepare('SELECT * FROM settings ORDER BY id').all().map(settingsFromRow),
  };
}

function currentEntity(entityType, id) {
  if (entityType === 'entry') {
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    return row ? entryFromRow(row) : undefined;
  }
  if (entityType === 'lens') {
    const row = db.prepare('SELECT * FROM lenses WHERE id = ?').get(id);
    return row ? lensFromRow(row) : undefined;
  }
  if (entityType === 'settings') {
    const row = db.prepare('SELECT * FROM settings WHERE id = ?').get(id);
    return row ? settingsFromRow(row) : undefined;
  }
  throw new Error(`Unknown entity type: ${entityType}`);
}

function storeEntity(entityType, value, revision) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string') throw new Error('Invalid sync entity');
  if (entityType === 'entry') {
    upsertEntry.run(value.id, value.frameNumber, value.lensId, value.lensName, value.lensShort, value.aperture,
      value.shiftX, value.shiftY, value.shiftProfile || 'pico', value.createdAt, value.updatedAt, value.deleted ? 1 : 0, revision);
    return;
  }
  if (entityType === 'lens') {
    upsertLens.run(value.id, value.short, value.name, JSON.stringify(value.apertures), value.active ? 1 : 0,
      value.builtIn ? 1 : 0, value.deleted ? 1 : 0, value.updatedAt, revision);
    return;
  }
  if (entityType === 'settings') {
    upsertSettings.run(value.id, value.lensId, value.aperture, value.shiftProfile || 'pico', value.updatedAt, revision);
    return;
  }
  throw new Error(`Unknown entity type: ${entityType}`);
}

function acceptMutation(mutation) {
  if (!mutation || typeof mutation.id !== 'string' || typeof mutation.entityId !== 'string') throw new Error('Invalid mutation');
  const alreadyApplied = findMutation.get(mutation.id);
  if (alreadyApplied) return Number(alreadyApplied.revision);
  const current = currentEntity(mutation.entityType, mutation.entityId);
  const incoming = mutation.value;
  if (!incoming || incoming.id !== mutation.entityId) throw new Error('Mutation entity mismatch');
  const authoritative = mutation.mode === 'bootstrap' && current && current.updatedAt > incoming.updatedAt ? current : incoming;
  const serverUpdatedAt = new Date().toISOString();
  const result = insertChange.run(mutation.entityType, mutation.entityId, JSON.stringify(authoritative), serverUpdatedAt);
  const revision = Number(result.lastInsertRowid);
  storeEntity(mutation.entityType, authoritative, revision);
  recordMutation.run(mutation.id, revision, serverUpdatedAt);
  return revision;
}

function latestRevision() {
  return Number(db.prepare('SELECT COALESCE(MAX(revision), 0) AS revision FROM change_log').get().revision);
}

function seedRevisionLog() {
  if (getMeta.get('revision_protocol_seeded')?.value === '1') return;
  const data = allData();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [entityType, records] of [['entry', data.entries], ['lens', data.lenses], ['settings', data.settings]]) {
      for (const value of records) {
        const serverUpdatedAt = new Date().toISOString();
        const result = insertChange.run(entityType, value.id, JSON.stringify(value), serverUpdatedAt);
        storeEntity(entityType, value, Number(result.lastInsertRowid));
      }
    }
    setMeta.run('revision_protocol_seeded', '1');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
seedRevisionLog();

async function createConsistentBackup() {
  const day = new Date().toISOString().slice(0, 10);
  const finalPath = join(backupsDirectory, `lens-log-${day}.sqlite`);
  const temporaryPath = join(backupsDirectory, `.lens-log-${randomUUID()}.sqlite`);
  try {
    await backup(db, temporaryPath);
    await unlink(finalPath).catch(() => undefined);
    await rename(temporaryPath, finalPath);
    const files = (await readdir(backupsDirectory)).filter((name) => /^lens-log-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort().reverse();
    await Promise.all(files.slice(backupRetention).map((name) => unlink(join(backupsDirectory, name))));
    console.info(`SQLite backup ready: ${finalPath}`);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    console.error('SQLite backup failed:', error);
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function bodyJson(request, limit = 1_000_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error('Request too large');
  }
  return JSON.parse(body || '{}');
}
async function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = join(publicDirectory, safePath);
  try { if (!(await stat(filePath)).isFile()) throw new Error('Not a file'); }
  catch { filePath = join(publicDirectory, 'index.html'); }
  const data = await readFile(filePath);
  const extension = extname(filePath);
  const immutable = filePath.includes(`${join('dist', 'assets')}`);
  response.writeHead(200, {
    'content-type': mimeTypes[extension] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  });
  response.end(data);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true, serverInstanceId, revision: latestRevision() });
    if (request.method === 'POST' && url.pathname === '/api/sync') {
      const payload = await bodyJson(request);
      const isLegacyClient = !Array.isArray(payload.mutations)
        && (Array.isArray(payload.entries) || Array.isArray(payload.lenses) || Array.isArray(payload.settings));
      if (isLegacyClient) {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const [entityType, records] of [['entry', payload.entries || []], ['lens', payload.lenses || []], ['settings', payload.settings || []]]) {
            for (const value of records) acceptMutation({
              id: `legacy:${entityType}:${value.id}:${value.updatedAt}`,
              entityType, entityId: value.id, value, mode: 'bootstrap',
            });
          }
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return sendJson(response, 200, { ...allData(), syncedAt: new Date().toISOString() });
      }
      const sinceRevision = Math.max(0, Number(payload.sinceRevision) || 0);
      const mutations = Array.isArray(payload.mutations) ? payload.mutations : [];
      if (mutations.length > 100) return sendJson(response, 413, { error: 'Too many mutations in one request' });
      const acknowledgedMutationIds = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const mutation of mutations) {
          acceptMutation(mutation);
          acknowledgedMutationIds.push(mutation.id);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      const latest = latestRevision();
      const rows = db.prepare('SELECT * FROM change_log WHERE revision > ? ORDER BY revision LIMIT ?').all(sinceRevision, changePageSize);
      const changes = rows.map((row) => ({ revision: Number(row.revision), entityType: row.entity_type, entityId: row.entity_id,
        value: JSON.parse(row.payload), serverUpdatedAt: row.server_updated_at }));
      const revision = changes.length ? changes.at(-1).revision : latest;
      return sendJson(response, 200, { serverInstanceId, acknowledgedMutationIds, changes, revision,
        latestRevision: latest, hasMore: revision < latest });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, error?.message === 'Request too large' ? 413 : 500, { error: error?.message || 'Internal server error' });
  }
});

server.listen(port, host, () => {
  console.log(`Lens Log listening on http://${host}:${port}`);
  void createConsistentBackup();
});
const backupTimer = setInterval(() => void createConsistentBackup(), 24 * 60 * 60 * 1000);
backupTimer.unref();

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
