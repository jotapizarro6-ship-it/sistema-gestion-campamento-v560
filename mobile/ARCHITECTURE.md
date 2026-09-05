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
