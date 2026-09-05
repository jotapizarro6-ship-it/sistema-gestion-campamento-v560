'use strict';

const KEY_PREFIX = 'garpi.admin.secure.';
const SESSION_KEY = 'admin-session-v1';
const SESSION_VERSION = 1;

export function createSecureSessionStore(secureStorage) {
  if (!secureStorage) {
    throw new Error('GARPI_NATIVE_SECURE_STORAGE_MISSING');
  }

  let initialized = false;

  async function initialize() {
    if (initialized) {
      return;
    }

    await secureStorage.setKeyPrefix(KEY_PREFIX);
    initialized = true;
  }

  async function setAdminToken(token) {
    await initialize();

    const normalized = String(token ?? '').trim();

    if (!normalized) {
      throw new Error('GARPI_NATIVE_EMPTY_ADMIN_TOKEN');
    }

    await secureStorage.set(
      SESSION_KEY,
      {
        version: SESSION_VERSION,
        token: normalized,
        storedAt: new Date().toISOString()
      },
      false
    );
  }

  async function getAdminToken() {
    await initialize();

    const value = await secureStorage.get(
      SESSION_KEY,
      false
    );

    if (value == null) {
      return null;
    }

    if (
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Number(value.version) !== SESSION_VERSION ||
      typeof value.token !== 'string' ||
      !value.token.trim()
    ) {
      await secureStorage.remove(SESSION_KEY);
      return null;
    }

    return value.token;
  }

  async function clearAdminToken() {
    await initialize();
    await secureStorage.remove(SESSION_KEY);
  }

  async function getMetadata() {
    await initialize();

    const value = await secureStorage.get(
      SESSION_KEY,
      false
    );

    if (
      value == null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return Object.freeze({
        present: false,
        version: SESSION_VERSION,
        storedAt: null
      });
    }

    return Object.freeze({
      present:
        typeof value.token === 'string' &&
        Boolean(value.token.trim()),
      version: Number(value.version) || SESSION_VERSION,
      storedAt:
        typeof value.storedAt === 'string'
          ? value.storedAt
          : null
    });
  }

  return Object.freeze({
    initialize,
    setAdminToken,
    getAdminToken,
    clearAdminToken,
    getMetadata
  });
}
