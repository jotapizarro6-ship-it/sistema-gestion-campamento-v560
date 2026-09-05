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

async function closeConnection(db) {
  try {
    if (db) {
      await db.close();
    }
  } finally {
    try {
      await sqlite.closeConnection(
        DATABASE_NAME,
        false
      );
    } catch {
      // Connection may already be closed. No secret or data is logged.
    }
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

export async function initializeLocalDatabase() {
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

export async function clearOperationalCache() {
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

export const localDatabaseContract =
  Object.freeze({
    name: DATABASE_NAME,
    schemaVersion: SCHEMA_VERSION,
    encrypted: true,
    authoritative: false
  });
