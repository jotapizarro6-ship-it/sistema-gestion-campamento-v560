'use strict';

import {
  App
} from '@capacitor/app';

import {
  Network
} from '@capacitor/network';

import {
  readOperationalReplica,
  readSyncState,
  writeOperationalReplica
} from './local-db.mjs';

import {
  compareOperationalRevisions,
  normalizeOperationalRevision
} from './revision-policy.mjs';

export function createNativeSyncEngine() {
  const state = {
    initialized: false,
    connected: false,
    connectionType: 'unknown',
    appActive: true,
    lastEvent: null,
    lastCapture: null,
    lastError: null
  };

  let networkHandle = null;
  let appHandle = null;
  let captureFlight = null;

  function publicStatus() {
    return Object.freeze({
      initialized:
        state.initialized,
      connected:
        state.connected,
      connectionType:
        state.connectionType,
      appActive:
        state.appActive,
      lastEvent:
        state.lastEvent,
      lastCapture:
        state.lastCapture,
      lastError:
        state.lastError
    });
  }

  function requestReconcile(reason) {
    state.lastEvent =
      String(reason || 'native');

    window.dispatchEvent(
      new CustomEvent(
        'garpi:native-reconcile-request',
        {
          detail: Object.freeze({
            reason: state.lastEvent
          })
        }
      )
    );
  }

  async function initialize() {
    if (state.initialized) {
      return publicStatus();
    }

    const network =
      await Network.getStatus();

    state.connected =
      Boolean(network.connected);

    state.connectionType =
      String(
        network.connectionType ||
        'unknown'
      );

    networkHandle =
      await Network.addListener(
        'networkStatusChange',
        status => {
          const wasConnected =
            state.connected;

          state.connected =
            Boolean(status.connected);

          state.connectionType =
            String(
              status.connectionType ||
              'unknown'
            );

          if (
            !wasConnected &&
            state.connected
          ) {
            requestReconcile(
              'network-reconnect'
            );
          }
        }
      );

    appHandle =
      await App.addListener(
        'appStateChange',
        event => {
          const wasActive =
            state.appActive;

          state.appActive =
            Boolean(event.isActive);

          if (
            !wasActive &&
            state.appActive
          ) {
            requestReconcile(
              'app-foreground'
            );
          }
        }
      );

    state.initialized = true;
    state.lastError = null;

    return publicStatus();
  }

  async function captureRemoteState({
    data,
    operationalRevision,
    reason = 'loadAll'
  }) {
    if (captureFlight) {
      return captureFlight;
    }

    captureFlight =
      (async () => {
        try {
          const remoteRevision =
            normalizeOperationalRevision(
              operationalRevision
            );

          const local =
            await readSyncState();

          const comparison =
            compareOperationalRevisions(
              local?.operationalRevision ??
                null,
              remoteRevision
            );

          if (
            comparison.relation ===
            'LOCAL_AHEAD'
          ) {
            throw new Error(
              'GARPI_SYNC_LOCAL_REVISION_AHEAD'
            );
          }

          const result =
            await writeOperationalReplica({
              data,
              operationalRevision:
                remoteRevision,
              reason
            });

          state.lastCapture =
            Object.freeze({
              operationalRevision:
                result.operationalRevision,
              syncedAt:
                result.syncedAt,
              reason:
                result.reason
            });

          state.lastError = null;

          window.dispatchEvent(
            new CustomEvent(
              'garpi:native-replica-updated',
              {
                detail:
                  state.lastCapture
              }
            )
          );

          return state.lastCapture;
        } catch (error) {
          state.lastError =
            error instanceof Error
              ? error.message
              : 'GARPI_SYNC_CAPTURE_ERROR';

          throw error;
        } finally {
          captureFlight = null;
        }
      })();

    return captureFlight;
  }

  async function getSyncState() {
    return await readSyncState();
  }

  async function getOperationalReplica() {
    return await readOperationalReplica();
  }

  async function getNetworkStatus() {
    const status =
      await Network.getStatus();

    state.connected =
      Boolean(status.connected);

    state.connectionType =
      String(
        status.connectionType ||
        'unknown'
      );

    return Object.freeze({
      connected:
        state.connected,
      connectionType:
        state.connectionType
    });
  }

  async function compareWithRemoteRevision(
    remoteRevision
  ) {
    const local =
      await readSyncState();

    return compareOperationalRevisions(
      local?.operationalRevision ??
        null,
      remoteRevision
    );
  }

  async function dispose() {
    if (networkHandle) {
      await networkHandle.remove();
      networkHandle = null;
    }

    if (appHandle) {
      await appHandle.remove();
      appHandle = null;
    }

    state.initialized = false;
  }

  return Object.freeze({
    initialize,
    captureRemoteState,
    getSyncState,
    getOperationalReplica,
    getNetworkStatus,
    compareWithRemoteRevision,
    requestReconcile,
    status: publicStatus,
    dispose
  });
}
