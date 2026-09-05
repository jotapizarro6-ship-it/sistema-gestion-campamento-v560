'use strict';

const fs = require('fs');

function replaceExactOnce(
  text,
  oldText,
  newText,
  label
) {
  const first = text.indexOf(oldText);

  if (first < 0) {
    throw new Error(
      `GARPI_NATIVE_ENV_PATCH_MISSING:${label}`
    );
  }

  const second = text.indexOf(
    oldText,
    first + oldText.length
  );

  if (second >= 0) {
    throw new Error(
      `GARPI_NATIVE_ENV_PATCH_MULTIPLE:${label}`
    );
  }

  return (
    text.slice(0, first) +
    newText +
    text.slice(first + oldText.length)
  );
}

function patchNativeRuntimeEnv(filePath) {
  let text = fs
    .readFileSync(filePath, 'utf8')
    .replace(/\r\n/g, '\n');

  const environmentOld = [
    "  const frontendHost = String(window.location.hostname || '').toLowerCase();",
    '  const isStagingLocal = LOCAL_HOSTS.has(frontendHost);',
    "  const mode = isStagingLocal ? 'staging-local' : 'production';",
    '  const supabaseOrigin = isStagingLocal ? STAGING_ORIGIN : PRODUCTION_ORIGIN;'
  ].join('\n');

  const environmentNew = [
    "  const frontendHost = String(window.location.hostname || '').toLowerCase();",
    '  const isNativeAndroid = Boolean(',
    '    window.GARPI_NATIVE &&',
    '    window.GARPI_NATIVE.native === true &&',
    "    window.GARPI_NATIVE.platform === 'android'",
    '  );',
    '  const isStagingLocal =',
    '    !isNativeAndroid &&',
    '    LOCAL_HOSTS.has(frontendHost);',
    "  const mode = isStagingLocal ? 'staging-local' : 'production';",
    '  const supabaseOrigin = isStagingLocal ? STAGING_ORIGIN : PRODUCTION_ORIGIN;',
    '',
    '  if (',
    '    isNativeAndroid &&',
    '    supabaseOrigin !== PRODUCTION_ORIGIN',
    '  ) {',
    "    throw new Error('GARPI_NATIVE_BACKEND_FENCE');",
    '  }'
  ].join('\n');

  text = replaceExactOnce(
    text,
    environmentOld,
    environmentNew,
    'ENVIRONMENT_SELECTION'
  );

  const exportOld = [
    '    mode,',
    '    isStagingLocal,',
    '    productionOrigin: PRODUCTION_ORIGIN,'
  ].join('\n');

  const exportNew = [
    '    mode,',
    '    isStagingLocal,',
    '    isNativeAndroid,',
    '    productionOrigin: PRODUCTION_ORIGIN,'
  ].join('\n');

  text = replaceExactOnce(
    text,
    exportOld,
    exportNew,
    'ENVIRONMENT_EXPORT'
  );

  if (
    !text.includes(
      "window.GARPI_NATIVE.platform === 'android'"
    )
  ) {
    throw new Error(
      'GARPI_NATIVE_ENV_ANDROID_MARKER_MISSING'
    );
  }

  if (
    !text.includes(
      'GARPI_NATIVE_BACKEND_FENCE'
    )
  ) {
    throw new Error(
      'GARPI_NATIVE_ENV_FENCE_MISSING'
    );
  }

  if (
    text.includes(
      'const isStagingLocal = LOCAL_HOSTS.has(frontendHost);'
    )
  ) {
    throw new Error(
      'GARPI_NATIVE_ENV_LEGACY_LOCALHOST_RULE_REMAINS'
    );
  }

  fs.writeFileSync(
    filePath,
    text,
    'utf8'
  );

  return Object.freeze({
    nativeAndroidOverride: true,
    backend: 'production',
    stagingOnNative: false
  });
}

module.exports = {
  patchNativeRuntimeEnv
};
