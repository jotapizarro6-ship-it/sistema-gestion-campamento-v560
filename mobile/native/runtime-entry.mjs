'use strict';

import {
  Capacitor
} from '@capacitor/core';

import {
  SecureStorage
} from '@aparajita/capacitor-secure-storage';

import {
  createSecureSessionStore
} from './session-store.mjs';

import {
  clearOperationalCache,
  initializeLocalDatabase,
  localDatabaseContract
} from './local-db.mjs';

const state = {
  ready: false,
  error: null,
  platform: Capacitor.getPlatform(),
  database: null
};

const session =
  createSecureSessionStore(
    SecureStorage
  );

function publicStatus() {
  return Object.freeze({
    ready: state.ready,
    error: state.error,
    platform: state.platform,
    secureSession: true,
    database:
      state.database
        ? Object.freeze({
            name: state.database.name,
            schemaVersion:
              state.database.schemaVersion,
            encrypted:
              state.database.encrypted,
            tables:
              [...state.database.tables]
          })
        : localDatabaseContract
  });
}

async function purgeAfterLogout() {
  await session.clearAdminToken();
  await clearOperationalCache();
}

async function boot() {
  if (
    !Capacitor.isNativePlatform() ||
    state.platform !== 'android'
  ) {
    throw new Error(
      'GARPI_NATIVE_ANDROID_RUNTIME_REQUIRED'
    );
  }

  await session.initialize();

  state.database =
    await initializeLocalDatabase();

  state.ready = true;
  state.error = null;

  window.dispatchEvent(
    new CustomEvent(
      'garpi:native-foundation-ready',
      {
        detail: publicStatus()
      }
    )
  );

  return publicStatus();
}

const api = Object.freeze({
  version: 1,
  session,
  database: Object.freeze({
    contract: localDatabaseContract,
    clearOperationalCache
  }),
  purgeAfterLogout,
  status: publicStatus,
  ready: boot()
});

Object.defineProperty(
  window,
  'GARPI_NATIVE_FOUNDATION',
  {
    configurable: false,
    enumerable: true,
    writable: false,
    value: api
  }
);

api.ready.catch(error => {
  state.ready = false;

  state.error =
    error instanceof Error
      ? error.message
      : 'GARPI_NATIVE_FOUNDATION_ERROR';

  window.dispatchEvent(
    new CustomEvent(
      'garpi:native-foundation-error',
      {
        detail: publicStatus()
      }
    )
  );
});
