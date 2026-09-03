(function (global) {
  'use strict';

  if (!global || global.GARPI_OBSERVABILITY) {
    return;
  }

  const META = Object.freeze({
    schemaVersion: 1,
    appVersion: '5.6.1-modern.12-r5-operational-v1',
    channel: 'r5-operational-v1',
    sourceSha: '291fd0c8939e7b850e50ca1b78be605f89eeea39',
    availabilitySloPercent: 99.9,
    errorBudget30dSeconds: 2592,
    latencySloMs: Object.freeze({
      public: 1500,
      admin: 2000,
      fastHealth: 3000,
      safeHealth: 3000,
      localHealth: 1000
    }),
    deployment: Object.freeze({
      provider: 'github-pages',
      workflowFile: '.github/workflows/pages.yml',
      workflowName: 'Publicar Sistema Campamento'
    })
  });

  const MAX_REQUEST_SAMPLES = 100;

  const state = {
    startedAt: new Date().toISOString(),
    windowErrors: 0,
    unhandledRejections: 0,
    requests: []
  };

  function now() {
    if (
      global.performance &&
      typeof global.performance.now === 'function'
    ) {
      return global.performance.now();
    }

    return Date.now();
  }

  function resolveUrl(input) {
    try {
      const raw =
        typeof input === 'string'
          ? input
          : input && typeof input.url === 'string'
            ? input.url
            : String(input);

      const base =
        global.location && global.location.href
          ? global.location.href
          : 'http://127.0.0.1/';

      const url = new URL(raw, base);

      return {
        origin: url.origin,
        path: url.pathname
      };
    } catch (_) {
      return {
        origin: '',
        path: '/invalid-url'
      };
    }
  }

  function classifyTarget(target) {
    const env = global.GARPI_ENV;

    if (
      env &&
      typeof env.supabaseOrigin === 'string' &&
      target.origin === env.supabaseOrigin &&
      target.path.indexOf('/functions/v1/') >= 0
    ) {
      return 'edge';
    }

    if (
      global.location &&
      target.origin === global.location.origin
    ) {
      return 'frontend';
    }

    return 'external';
  }

  function recordRequest(sample) {
    state.requests.push(Object.freeze(sample));

    if (state.requests.length > MAX_REQUEST_SAMPLES) {
      state.requests.splice(
        0,
        state.requests.length - MAX_REQUEST_SAMPLES
      );
    }
  }

  function percentile(values, percent) {
    if (!values.length) {
      return null;
    }

    const ordered = values.slice().sort(function (a, b) {
      return a - b;
    });

    let index = Math.ceil((percent / 100) * ordered.length) - 1;

    if (index < 0) {
      index = 0;
    }

    if (index >= ordered.length) {
      index = ordered.length - 1;
    }

    return Math.round(ordered[index] * 100) / 100;
  }

  function summarizeRequests() {
    const samples = state.requests.slice();

    const successful = samples.filter(function (item) {
      return item.ok === true;
    }).length;

    const latencies = samples.map(function (item) {
      return item.latencyMs;
    });

    return {
      total: samples.length,
      successful: successful,
      failed: samples.length - successful,
      availabilityPercent:
        samples.length === 0
          ? null
          : Math.round((successful / samples.length) * 100000) / 1000,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95)
    };
  }

  function snapshot() {
    return Object.freeze({
      meta: META,
      environment:
        global.GARPI_ENV && global.GARPI_ENV.mode
          ? global.GARPI_ENV.mode
          : 'unknown',
      startedAt: state.startedAt,
      capturedAt: new Date().toISOString(),
      errors: Object.freeze({
        window: state.windowErrors,
        unhandledRejections: state.unhandledRejections,
        total: state.windowErrors + state.unhandledRejections
      }),
      requests: Object.freeze(summarizeRequests())
    });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('error', function () {
      state.windowErrors += 1;
    });

    global.addEventListener('unhandledrejection', function () {
      state.unhandledRejections += 1;
    });
  }

  const previousFetch =
    typeof global.fetch === 'function'
      ? global.fetch.bind(global)
      : null;

  if (previousFetch) {
    global.fetch = async function (input, init) {
      const started = now();
      const target = resolveUrl(input);
      const method =
        init && typeof init.method === 'string'
          ? init.method.toUpperCase()
          : 'GET';

      try {
        const response = await previousFetch(input, init);
        const latencyMs =
          Math.round((now() - started) * 100) / 100;

        recordRequest({
          method: method,
          category: classifyTarget(target),
          path: target.path,
          status: Number(response.status || 0),
          ok:
            typeof response.ok === 'boolean'
              ? response.ok
              : Number(response.status) >= 200 &&
                Number(response.status) < 400,
          latencyMs: latencyMs
        });

        return response;
      } catch (error) {
        const latencyMs =
          Math.round((now() - started) * 100) / 100;

        recordRequest({
          method: method,
          category: classifyTarget(target),
          path: target.path,
          status: 0,
          ok: false,
          latencyMs: latencyMs
        });

        throw error;
      }
    };
  }

  async function checkVersion() {
    if (typeof global.fetch !== 'function') {
      return Object.freeze({
        ok: false,
        match: false,
        reason: 'FETCH_UNAVAILABLE'
      });
    }

    try {
      const response = await global.fetch(
        'version.json',
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

      if (!response || Number(response.status) !== 200) {
        return Object.freeze({
          ok: false,
          match: false,
          reason: 'VERSION_HTTP'
        });
      }

      const json = await response.json();

      const match =
        json &&
        json.version === META.appVersion &&
        json.channel === META.channel &&
        json.source_sha === META.sourceSha;

      return Object.freeze({
        ok: true,
        match: Boolean(match),
        version: json && json.version ? json.version : null,
        channel: json && json.channel ? json.channel : null,
        sourceSha: json && json.source_sha ? json.source_sha : null
      });
    } catch (_) {
      return Object.freeze({
        ok: false,
        match: false,
        reason: 'VERSION_FETCH'
      });
    }
  }

  Object.defineProperty(
    global,
    'GARPI_OBSERVABILITY',
    {
      configurable: false,
      enumerable: true,
      writable: false,
      value: Object.freeze({
        meta: META,
        snapshot: snapshot,
        checkVersion: checkVersion
      })
    }
  );
})(window);