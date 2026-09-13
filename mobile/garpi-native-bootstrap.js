'use strict';

(() => {
  const nativeInfo = Object.freeze({
    client: 'GARPI_ADMIN_ANDROID',
    native: true,
    platform: 'android',
    shell: 'capacitor',
    localSchemaVersion: 1
  });

  Object.defineProperty(window, 'GARPI_NATIVE', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: nativeInfo
  });

  document.documentElement.dataset.garpiPlatform = 'android';

  const markBody = () => {
    document.body?.classList.add('garpi-native-android');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markBody, { once: true });
  } else {
    markBody();
  }
})();
