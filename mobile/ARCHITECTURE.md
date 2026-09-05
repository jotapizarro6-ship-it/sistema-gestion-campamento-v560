# GARPI Admin Android — R11 Architecture

GARPI remains one system with two official administrative clients:

- GARPI Admin Web / PWA
- GARPI Admin Android / Capacitor

Supabase through GARPI FAST/SAFE remains the central source of truth.

## Native shell

The Android client is built from `mobile-dist`.

`mobile-dist` is generated and is never a second editable source tree.

The generator:

- derives the shell from the certified `admin.html`;
- copies shared GARPI assets;
- converts the administrator page into native `index.html`;
- excludes the worker/public entry point;
- excludes the Web Service Worker;
- excludes the Web PWA install/update runtime;
- injects a native platform marker.

## Android identity

Application ID:

`cl.garpi.campamento.admin`

Development version:

`0.1.0-dev`

Initial Android versionCode:

`1`

Local database schema version:

`1`

## Future R11 layers

The following are intentionally not implemented during R11-A2:

- secure native authentication/session storage;
- SQLite replica/cache;
- sync engine;
- operational_revision reconciliation;
- private Realtime Broadcast;
- offline read mode;
- Android notifications;
- release signing;
- AI assistant;
- analytics layer.

Those layers will be added incrementally after the native shell and
Gradle build are proven.

## Update model

GARPI Android will evolve through signed Android releases.

The application ID remains stable.

`versionCode` only increases.

SQLite changes will use schema migrations.

The Web/PWA and Android clients share domain/backend contracts while
platform-specific capabilities remain isolated.

## R11-C1 Secure Native Foundation

The Android client uses a native-only secure foundation:

- `@aparajita/capacitor-secure-storage` stores authenticated session material.
- The administrator password is never persisted.
- Native session storage has no LocalStorage or SessionStorage fallback.
- `@capacitor-community/sqlite` provides the local replica/cache database.
- Android SQLite encryption is enabled with SQLCipher.
- The database encryption secret is generated on-device and retained by the native SQLite secure store.
- Android application backup is disabled to avoid restoring encrypted application data without its device-bound protection material.
- SQLite schema upgrades are versioned; normal upgrades must migrate rather than drop/recreate the database.
- SQLite remains a cache/replica only. Supabase/GARPI APIs remain authoritative.
- R11-C1A creates only the encrypted schema foundation. Operational synchronization is introduced later in R11-D.
- Critical offline mutations remain blocked by policy.
- Logout will clear secure session material and operational cache through the native foundation.

### Native backend environment

Capacitor serves bundled assets from a local WebView origin. That local shell origin is not a GARPI staging environment.

The generated Android copy of `garpi-runtime-env.js` therefore treats `GARPI_NATIVE.native === true` with platform `android` as the official mobile client and selects the central production GARPI/Supabase backend.

The Web/PWA source keeps its existing localhost staging behavior unchanged.

This distinction is security-sensitive: WebView origin describes where bundled HTML is served; it must never implicitly select the operational backend.

## R11-D deterministic synchronization

The Android client reconciles against the central GARPI operational revision.

- Central GARPI/Supabase remains authoritative.
- `advanced_state.state_version` is the authoritative revision attached to a downloaded operational state.
- `GET action=revision` is used as a lightweight reconciliation probe.
- If local and remote revisions match, no full operational refresh is required.
- If the remote revision is newer or no local replica exists, Android performs a read-only `loadAll({snapshot:false})`.
- A successful remote state is transactionally written to encrypted SQLite.
- SQLite never claims authority over central state.
- A local revision ahead of the server is fail-closed and treated as an integrity error.
- Foreground and network-reconnect events request reconciliation.
- No interval polling is used.
- No critical offline mutation queue is enabled.
- Public consult logs and import history are not persisted in the operational SQLite replica in this layer, reducing cached PII.
- Private Realtime Broadcast remains a later optimization signal; revision reconciliation remains authoritative.
