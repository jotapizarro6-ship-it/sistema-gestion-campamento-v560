import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const version = JSON.parse(
  fs.readFileSync('version.json', 'utf8')
);

const contract = JSON.parse(
  fs.readFileSync('observability.json', 'utf8')
);

assert.equal(contract.schema, 1);
assert.equal(contract.identity.version, version.version);
assert.equal(contract.identity.channel, version.channel);
assert.equal(contract.identity.source_sha, version.source_sha);

assert.equal(contract.slo.availability_percent, 99.9);
assert.equal(contract.slo.error_budget_30d_seconds, 2592);

assert.equal(
  contract.deployment.workflow_file,
  '.github/workflows/pages.yml'
);

assert.equal(
  contract.deployment.workflow_name,
  'Publicar Sistema Campamento'
);

assert.equal(contract.runtime.capture_query_strings, false);
assert.equal(contract.runtime.capture_request_bodies, false);
assert.equal(contract.runtime.capture_response_bodies, false);
assert.equal(contract.runtime.capture_error_messages, false);
assert.equal(contract.runtime.capture_pii, false);

for (const htmlFile of ['index.html', 'admin.html']) {
  const html = fs.readFileSync(htmlFile, 'utf8');

  const env = html.indexOf('assets/garpi-runtime-env.js');
  const obs = html.indexOf('assets/garpi-observability.js');
  const app = html.indexOf('assets/app-1.js');

  assert.ok(env >= 0, `${htmlFile}: env missing`);
  assert.ok(obs > env, `${htmlFile}: observability before env`);
  assert.ok(app > obs, `${htmlFile}: app before observability`);
}

const runtimeCode = fs.readFileSync(
  'assets/garpi-observability.js',
  'utf8'
);

assert.equal(
  runtimeCode.includes(['usrst','cxiluvsizoxwlxj'].join('')),
  false,
  'observability runtime must not hardcode production ref'
);

let clock = 10;
const listeners = {};

const context = {
  console,
  URL,
  Date,

  location: {
    href: 'http://127.0.0.1:8765/index.html',
    origin: 'http://127.0.0.1:8765'
  },

  performance: {
    now() {
      clock += 5;
      return clock;
    }
  },

  GARPI_ENV: {
    mode: 'staging-local',
    supabaseOrigin: 'http://127.0.0.1:54321'
  },

  addEventListener(name, handler) {
    listeners[name] = handler;
  },

  async fetch(input) {
    const value = String(input);

    if (value.endsWith('version.json')) {
      return {
        status: 200,
        ok: true,
        async json() {
          return version;
        }
      };
    }

    return {
      status: 200,
      ok: true,
      async json() {
        return {};
      }
    };
  }
};

context.window = context;
context.globalThis = context;

vm.runInNewContext(
  runtimeCode,
  context,
  {
    filename: 'garpi-observability.js'
  }
);

assert.ok(context.GARPI_OBSERVABILITY);
assert.equal(
  context.GARPI_OBSERVABILITY.meta.appVersion,
  version.version
);
assert.equal(
  context.GARPI_OBSERVABILITY.meta.channel,
  version.channel
);
assert.equal(
  context.GARPI_OBSERVABILITY.meta.sourceSha,
  version.source_sha
);

await context.fetch('/synthetic-health');

const versionCheck =
  await context.GARPI_OBSERVABILITY.checkVersion();

assert.equal(versionCheck.ok, true);
assert.equal(versionCheck.match, true);

listeners.error?.({});
listeners.unhandledrejection?.({});

const snapshot =
  context.GARPI_OBSERVABILITY.snapshot();

assert.equal(snapshot.environment, 'staging-local');
assert.equal(snapshot.errors.window, 1);
assert.equal(snapshot.errors.unhandledRejections, 1);
assert.equal(snapshot.errors.total, 2);

assert.equal(snapshot.requests.total, 2);
assert.equal(snapshot.requests.successful, 2);
assert.equal(snapshot.requests.failed, 0);
assert.equal(snapshot.requests.availabilityPercent, 100);

console.log(
  'Observability contract smoke: OK · version/channel/SHA · SLI/SLO · fetch latency · browser errors · privacy fence'
);