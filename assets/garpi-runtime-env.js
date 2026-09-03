(function () {
  'use strict';

  const PRODUCTION_ORIGIN = 'https://usrstcxiluvsizoxwlxj.supabase.co';
  const STAGING_ORIGIN = 'http://127.0.0.1:54321';
  const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

  const frontendHost = String(window.location.hostname || '').toLowerCase();
  const isStagingLocal = LOCAL_HOSTS.has(frontendHost);
  const mode = isStagingLocal ? 'staging-local' : 'production';
  const supabaseOrigin = isStagingLocal ? STAGING_ORIGIN : PRODUCTION_ORIGIN;
  const supabaseHost = new URL(supabaseOrigin).hostname;
  const functionsOrigin = `${supabaseOrigin}/functions/v1`;

  function normalizeFunctionName(name) {
    const value = String(name || '').trim();
    if (!/^campamento-[a-z0-9-]+$/.test(value)) {
      throw new Error(`GARPI_INVALID_FUNCTION_NAME:${value}`);
    }
    return value;
  }

  function functionUrl(name, query) {
    const functionName = normalizeFunctionName(name);
    const rawQuery = query == null ? '' : String(query).trim();
    const suffix = rawQuery
      ? (rawQuery.startsWith('?') ? rawQuery : `?${rawQuery}`)
      : '';
    return `${functionsOrigin}/${functionName}${suffix}`;
  }

  function inputToUrl(input) {
    if (typeof input === 'string') return new URL(input, window.location.href);
    if (input instanceof URL) return new URL(input.href);
    if (input && typeof input.url === 'string') return new URL(input.url, window.location.href);
    return new URL(String(input), window.location.href);
  }

  function assertRuntimeUrl(input) {
    const url = inputToUrl(input);

    if (isStagingLocal && url.origin === PRODUCTION_ORIGIN) {
      throw new Error(`GARPI_STAGING_PRODUCTION_FENCE:${url.href}`);
    }

    return url;
  }

  if (isStagingLocal) {
    const originalFetch = window.fetch.bind(window);

    window.fetch = function garpiStagingFetch(input, init) {
      assertRuntimeUrl(input);
      return originalFetch(input, init);
    };

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
      const originalOpen = window.XMLHttpRequest.prototype.open;

      window.XMLHttpRequest.prototype.open = function garpiStagingXhrOpen(method, url) {
        assertRuntimeUrl(url);
        return originalOpen.apply(this, arguments);
      };
    }

    if (navigator && typeof navigator.sendBeacon === 'function') {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);

      navigator.sendBeacon = function garpiStagingSendBeacon(url, data) {
        assertRuntimeUrl(url);
        return originalSendBeacon(url, data);
      };
    }
  }

  window.GARPI_ENV = Object.freeze({
    mode,
    isStagingLocal,
    productionOrigin: PRODUCTION_ORIGIN,
    stagingOrigin: STAGING_ORIGIN,
    supabaseOrigin,
    supabaseHost,
    functionsOrigin,
    functionUrl,
    assertRuntimeUrl
  });

  function mountStagingBanner() {
    if (!isStagingLocal) return;
    if (!document.body) return;
    if (document.getElementById('garpiStagingBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'garpiStagingBanner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = 'STAGING LOCAL / DATOS SINTETICOS';

    Object.assign(banner.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '2147483647',
      padding: '8px 12px',
      borderRadius: '8px',
      background: '#7f1d1d',
      color: '#ffffff',
      border: '2px solid #fecaca',
      boxShadow: '0 4px 16px rgba(0,0,0,.25)',
      font: '700 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      letterSpacing: '.04em',
      pointerEvents: 'none'
    });

    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStagingBanner, { once: true });
  } else {
    mountStagingBanner();
  }
})();
