'use strict';

import {
  CapacitorSQLite,
  SQLiteConnection
} from '@capacitor-community/sqlite';

const DATABASE_NAME = 'garpi_admin_cache';
const SCHEMA_VERSION = 1;

const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS garpi_meta (
        meta_key TEXT PRIMARY KEY NOT NULL,
        meta_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operational_cache (
        cache_key TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        operational_revision INTEGER,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        operational_revision INTEGER,
        last_sync_at TEXT,
        last_sync_reason TEXT,
        updated_at TEXT NOT NULL
      );
    `
  })
]);

const sqlite = new SQLiteConnection(
  CapacitorSQLite
);

function createPassphrase() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array
    .from(
      bytes,
      value => value.toString(16).padStart(2, '0')
    )
    .join('');
}

async function ensureEncryptionSecret() {
  const config = await sqlite.isInConfigEncryption();

  if (!config?.result) {
    throw new Error(
      'GARPI_SQLITE_ENCRYPTION_NOT_ENABLED'
    );
  }

  const stored = await sqlite.isSecretStored();

  if (stored?.result) {
    return 'existing';
  }

  const passphrase = createPassphrase();

  await sqlite.setEncryptionSecret(
    passphrase
  );

  return 'created';
}

async function openConnection() {
  const consistency =
    await sqlite.checkConnectionsConsistency();

  const existing =
    await sqlite.isConnection(
      DATABASE_NAME,
      false
    );

  let db;

  if (
    consistency?.result &&
    existing?.result
  ) {
    db = await sqlite.retrieveConnection(
      DATABASE_NAME,
      false
    );
  } else {
    db = await sqlite.createConnection(
      DATABASE_NAME,
      true,
      'secret',
      SCHEMA_VERSION,
      false
    );
  }

  await db.open();

  return db;
}

function isAlreadyClosedError(error) {
  const message =
    String(
      error?.message ??
      error ??
      ''
    );

  return message.includes(
    'No available connection for database'
  );
}

async function closeConnection(db) {
  let closeError = null;

  if (db) {
    try {
      await db.close();
    } catch (error) {
      if (!isAlreadyClosedError(error)) {
        closeError = error;
      }
    }
  }

  try {
    await sqlite.closeConnection(
      DATABASE_NAME,
      false
    );
  } catch (error) {
    if (
      !isAlreadyClosedError(error) &&
      !closeError
    ) {
      closeError = error;
    }
  }

  if (closeError) {
    throw closeError;
  }
}

async function currentSchemaVersion(db) {
  const result = await db.query(
    'PRAGMA user_version;'
  );

  const raw =
    result?.values?.[0]?.user_version;

  const version = Number(raw ?? 0);

  if (
    !Number.isInteger(version) ||
    version < 0
  ) {
    throw new Error(
      'GARPI_SQLITE_INVALID_SCHEMA_VERSION'
    );
  }

  return version;
}

async function applyMigrations(db) {
  let current =
    await currentSchemaVersion(db);

  if (current > SCHEMA_VERSION) {
    throw new Error(
      'GARPI_SQLITE_SCHEMA_NEWER_THAN_APP'
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }

    await db.execute(
      migration.sql
    );

    await db.execute(
      `PRAGMA user_version = ${migration.version};`
    );

    current =
      await currentSchemaVersion(db);

    if (current !== migration.version) {
      throw new Error(
        'GARPI_SQLITE_MIGRATION_VERSION_MISMATCH'
      );
    }
  }

  if (current !== SCHEMA_VERSION) {
    throw new Error(
      'GARPI_SQLITE_SCHEMA_VERSION_MISMATCH'
    );
  }

  return current;
}

async function verifySchema(db) {
  const result = await db.query(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN (
        'garpi_meta',
        'operational_cache',
        'sync_state'
      )
    ORDER BY name;
  `);

  const names = new Set(
    (result?.values ?? [])
      .map(row => String(row.name ?? ''))
      .filter(Boolean)
  );

  const expected = [
    'garpi_meta',
    'operational_cache',
    'sync_state'
  ];

  for (const name of expected) {
    if (!names.has(name)) {
      throw new Error(
        `GARPI_SQLITE_TABLE_MISSING:${name}`
      );
    }
  }

  return expected;
}

async function initializeLocalDatabaseUnlocked() {
  const secretState =
    await ensureEncryptionSecret();

  let db = null;

  try {
    db = await openConnection();

    const version =
      await applyMigrations(db);

    const tables =
      await verifySchema(db);

    const encryption =
      await sqlite.isDatabaseEncrypted(
        DATABASE_NAME
      );

    if (!encryption?.result) {
      throw new Error(
        'GARPI_SQLITE_DATABASE_NOT_ENCRYPTED'
      );
    }

    return Object.freeze({
      name: DATABASE_NAME,
      schemaVersion: version,
      encrypted: true,
      encryptionSecretState: secretState,
      tables: Object.freeze([...tables])
    });
  } finally {
    await closeConnection(db);
  }
}

async function clearOperationalCacheUnlocked() {
  let db = null;

  try {
    db = await openConnection();

    await db.execute(`
      DELETE FROM operational_cache;
      DELETE FROM sync_state;
    `);
  } finally {
    await closeConnection(db);
  }
}

const OPERATIONAL_CACHE_KEY =
  'advanced_state_v1';

function normalizeReplicaRevision(value) {
  const text =
    String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    throw new Error(
      'GARPI_SQLITE_INVALID_OPERATIONAL_REVISION'
    );
  }

  const revision =
    Number.parseInt(text, 10);

  if (
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new Error(
      'GARPI_SQLITE_INVALID_OPERATIONAL_REVISION'
    );
  }

  return revision;
}

function parseReplicaPayload(text) {
  try {
    const value =
      JSON.parse(
        String(text ?? '')
      );

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

async function writeOperationalReplicaUnlocked({
  data,
  operationalRevision,
  reason = 'remote-load'
}) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'GARPI_SQLITE_INVALID_OPERATIONAL_PAYLOAD'
    );
  }

  const revision =
    normalizeReplicaRevision(
      operationalRevision
    );

  const syncedAt =
    new Date().toISOString();

  const payload =
    JSON.stringify(data);

  let db = null;

  try {
    db =
      await openConnection();

    await db.beginTransaction();

    const transactionActive =
      await db.isTransactionActive();

    if (!transactionActive) {
      throw new Error(
        'GARPI_SQLITE_TRANSACTION_NOT_ACTIVE'
      );
    }

    try {
      await db.run(
        `
          INSERT INTO operational_cache (
            cache_key,
            payload_json,
            operational_revision,
            synced_at
          )
          VALUES (?, ?, ?, ?)
          ON CONFLICT(cache_key)
          DO UPDATE SET
            payload_json = excluded.payload_json,
            operational_revision =
              excluded.operational_revision,
            synced_at = excluded.synced_at;
        `,
        [
          OPERATIONAL_CACHE_KEY,
          payload,
          revision,
          syncedAt
        ],
        false
      );

      await db.run(
        `
          INSERT INTO sync_state (
            id,
            operational_revision,
            last_sync_at,
            last_sync_reason,
            updated_at
          )
          VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(id)
          DO UPDATE SET
            operational_revision =
              excluded.operational_revision,
            last_sync_at =
              excluded.last_sync_at,
            last_sync_reason =
              excluded.last_sync_reason,
            updated_at =
              excluded.updated_at;
        `,
        [
          revision,
          syncedAt,
          String(reason || 'remote-load'),
          syncedAt
        ],
        false
      );

      await db.commitTransaction();
    } catch (error) {
      try {
        const active =
          await db.isTransactionActive();

        if (active) {
          await db.rollbackTransaction();
        }
      } catch {
        // Preserve original transactional failure.
      }

      throw error;
    }
  } finally {
    await closeConnection(db);
  }

  return Object.freeze({
    operationalRevision: revision,
    syncedAt,
    reason:
      String(reason || 'remote-load')
  });
}

async function readSyncStateUnlocked() {
  let db = null;

  try {
    db =
      await openConnection();

    const result =
      await db.query(`
        SELECT
          operational_revision,
          last_sync_at,
          last_sync_reason,
          updated_at
        FROM sync_state
        WHERE id = 1
        LIMIT 1;
      `);

    const row =
      result?.values?.[0];

    if (!row) {
      return null;
    }

    const revision =
      row.operational_revision === null ||
      row.operational_revision === undefined
        ? null
        : normalizeReplicaRevision(
            row.operational_revision
          );

    return Object.freeze({
      operationalRevision:
        revision,
      lastSyncAt:
        row.last_sync_at ?? null,
      lastSyncReason:
        row.last_sync_reason ?? null,
      updatedAt:
        row.updated_at ?? null
    });
  } finally {
    await closeConnection(db);
  }
}

async function readOperationalReplicaUnlocked() {
  let db = null;

  try {
    db =
      await openConnection();

    const result =
      await db.query(
        `
          SELECT
            payload_json,
            operational_revision,
            synced_at
          FROM operational_cache
          WHERE cache_key = ?
          LIMIT 1;
        `,
        [
          OPERATIONAL_CACHE_KEY
        ]
      );

    const row =
      result?.values?.[0];

    if (!row) {
      return null;
    }

    const data =
      parseReplicaPayload(
        row.payload_json
      );

    if (!data) {
      throw new Error(
        'GARPI_SQLITE_CORRUPT_OPERATIONAL_REPLICA'
      );
    }

    return Object.freeze({
      data,
      operationalRevision:
        normalizeReplicaRevision(
          row.operational_revision
        ),
      syncedAt:
        row.synced_at ?? null
    });
  } finally {
    await closeConnection(db);
  }
}

export const operationalReplicaContract =
  Object.freeze({
    cacheKey:
      OPERATIONAL_CACHE_KEY,
    authoritative: false,
    mutationQueue: false,
    offlineCriticalMutations: false
  });

export const localDatabaseContract =
  Object.freeze({
    name: DATABASE_NAME,
    schemaVersion: SCHEMA_VERSION,
    encrypted: true,
    authoritative: false
  });

let dbOperationTail =
  Promise.resolve();

function serializeDbOperation(operation) {
  const run =
    dbOperationTail.then(
      operation,
      operation
    );

  dbOperationTail =
    run.then(
      () => undefined,
      () => undefined
    );

  return run;
}

export async function initializeLocalDatabase() {
  return await serializeDbOperation(
    () =>
      initializeLocalDatabaseUnlocked()
  );
}

export async function clearOperationalCache() {
  return await serializeDbOperation(
    () =>
      clearOperationalCacheUnlocked()
  );
}

export async function writeOperationalReplica(options) {
  return await serializeDbOperation(
    () =>
      writeOperationalReplicaUnlocked(
        options
      )
  );
}

export async function readSyncState() {
  return await serializeDbOperation(
    () =>
      readSyncStateUnlocked()
  );
}

export async function readOperationalReplica() {
  return await serializeDbOperation(
    () =>
      readOperationalReplicaUnlocked()
  );
}