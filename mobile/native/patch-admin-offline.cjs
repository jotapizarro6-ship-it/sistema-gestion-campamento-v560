'use strict';

const fs = require('fs');

function fail(kind, label) {
  throw new Error(
    `GARPI_NATIVE_OFFLINE_PATCH_${kind}:${label}`
  );
}

function insertAfterUniqueLine(
  text,
  marker,
  insertion,
  label
) {
  const first =
    text.indexOf(marker);

  if (first < 0) {
    fail('MISSING', label);
  }

  const second =
    text.indexOf(
      marker,
      first + marker.length
    );

  if (second >= 0) {
    fail('MULTIPLE', label);
  }

  const lineEnd =
    text.indexOf(
      '\n',
      first
    );

  if (lineEnd < 0) {
    fail('MALFORMED', label);
  }

  return (
    text.slice(
      0,
      lineEnd + 1
    ) +
    insertion +
    text.slice(
      lineEnd + 1
    )
  );
}

function insertLoadAllOfflineBranch(
  text
) {
  const functionMarker =
    'async function loadAllRun(';

  const functionAt =
    text.indexOf(
      functionMarker
    );

  if (functionAt < 0) {
    fail(
      'MISSING',
      'loadAllRun'
    );
  }

  if (
    text.indexOf(
      functionMarker,
      functionAt +
        functionMarker.length
    ) >= 0
  ) {
    fail(
      'MULTIPLE',
      'loadAllRun'
    );
  }

  const nextFunction =
    text.indexOf(
      'async function ',
      functionAt +
        functionMarker.length
    );

  const tryMarker =
    '  try{\n';

  const tryAt =
    text.indexOf(
      tryMarker,
      functionAt
    );

  if (
    tryAt < 0 ||
    (
      nextFunction >= 0 &&
      tryAt > nextFunction
    )
  ) {
    fail(
      'MISSING',
      'loadAllRun-try'
    );
  }

  const insertion = [
    '    const nativeFoundation=',
    '      window.GARPI_NATIVE_FOUNDATION;',
    '',
    '    if(!nativeFoundation?.sync){',
    '      const e=new Error(',
    "        'GARPI native foundation no disponible.'",
    '      );',
    "      e.code='GARPI_NATIVE_FOUNDATION_MISSING';",
    '      throw e;',
    '    }',
    '',
    '    await nativeFoundation.ready;',
    '',
    '    const network=',
    '      await nativeFoundation.sync.getNetworkStatus();',
    '',
    '    if(!network.connected){',
    '      const replica=',
    '        await nativeFoundation.sync.getOperationalReplica();',
    '',
    '      if(!replica?.data){',
    '        const e=new Error(',
    "          'Sin conexión y sin una copia local disponible.'",
    '        );',
    "        e.code='GARPI_NATIVE_OFFLINE_REPLICA_UNAVAILABLE';",
    '        e.offline=true;',
    '        throw e;',
    '      }',
    '',
    '      if(',
    '        sequence!==',
    '        loadAllSequence',
    '      ){',
    '        return true;',
    '      }',
    '',
    '      A.data=',
    '        replica.data;',
    '',
    '      A.consults=[];',
    '      A.imports=[];',
    '',
    '      if(',
    '        replica.operationalRevision!=null',
    '      ){',
    '        A.stateVersion=',
    '          String(',
    '            replica.operationalRevision',
    '          );',
    '      }',
    '',
    '      const source=',
    '        A.data.settings?.source_file||',
    "        'Sin planilla';",
    '',
    '      const updated=',
    '        A.data.settings?.last_update||',
    "        '—';",
    '',
    '      const syncedAt=',
    '        replica.syncedAt||',
    "        'sin fecha';",
    '',
    "      $('#systemMeta').textContent=",
    '        `Sin conexión · copia local ${syncedAt} · ${source} · ${updated}`;',
    '',
    '      loadAllSyncState(',
    "        'Sin conexión · copia local',",
    "        'warn'",
    '      );',
    '',
    '      renderAll();',
    '',
    '      window.dispatchEvent(',
    '        new CustomEvent(',
    "          'GARPI_NATIVE_OFFLINE_REPLICA_APPLIED',",
    '          {',
    '            detail:{',
    '              operationalRevision:',
    '                replica.operationalRevision??null,',
    '              syncedAt:',
    '                replica.syncedAt??null',
    '            }',
    '          }',
    '        )',
    '      );',
    '',
    '      return true;',
    '    }',
    ''
  ].join('\n');

  return (
    text.slice(
      0,
      tryAt +
        tryMarker.length
    ) +
    insertion +
    text.slice(
      tryAt +
        tryMarker.length
    )
  );
}

function networkGuard(
  indent
) {
  return [
    `${indent}const nativeFoundation=window.GARPI_NATIVE_FOUNDATION;`,
    `${indent}if(!nativeFoundation?.sync){`,
    `${indent}  const e=new Error('GARPI native foundation no disponible.');`,
    `${indent}  e.code='GARPI_NATIVE_FOUNDATION_MISSING';`,
    `${indent}  throw e;`,
    `${indent}}`,
    `${indent}await nativeFoundation.ready;`,
    `${indent}const network=await nativeFoundation.sync.getNetworkStatus();`,
    `${indent}if(!network.connected){`,
    `${indent}  const isWrite=String(method||'GET').toUpperCase()!=='GET';`,
    `${indent}  const e=new Error(`,
    `${indent}    isWrite`,
    `${indent}      ? 'Sin conexión. Esta acción requiere conexión y no se guardará para después.'`,
    `${indent}      : 'Sin conexión. Esta consulta requiere conexión.'`,
    `${indent}  );`,
    `${indent}  e.code=isWrite`,
    `${indent}    ? 'GARPI_NATIVE_OFFLINE_WRITE_BLOCKED'`,
    `${indent}    : 'GARPI_NATIVE_OFFLINE_NETWORK_REQUIRED';`,
    `${indent}  e.offline=true;`,
    `${indent}  throw e;`,
    `${indent}}`,
    ''
  ].join('\n');
}

function readText(
  filePath
) {
  return fs
    .readFileSync(
      filePath,
      'utf8'
    )
    .replace(
      /\r\n/g,
      '\n'
    );
}

function writeText(
  filePath,
  text
) {
  fs.writeFileSync(
    filePath,
    text,
    'utf8'
  );
}

function patchNativeAdminOffline({
  adminApiPath,
  adminStatePath,
  operationsCorePath
}) {
  let adminApi =
    readText(
      adminApiPath
    );

  adminApi =
    insertAfterUniqueLine(
      adminApi,
      'async function webApi(',
      networkGuard('  '),
      'webApi'
    );

  adminApi =
    insertAfterUniqueLine(
      adminApi,
      'async function advApi(',
      networkGuard('  '),
      'advApi'
    );

  writeText(
    adminApiPath,
    adminApi
  );

  let adminState =
    readText(
      adminStatePath
    );

  adminState =
    insertLoadAllOfflineBranch(
      adminState
    );

  writeText(
    adminStatePath,
    adminState
  );

  let operationsCore =
    readText(
      operationsCorePath
    );

  operationsCore =
    insertAfterUniqueLine(
      operationsCore,
      '  async function controlApi(',
      networkGuard('    '),
      'controlApi'
    );

  writeText(
    operationsCorePath,
    operationsCore
  );

  return Object.freeze({
    adminApi: true,
    adminState: true,
    operationsCore: true,
    offlineReads: 'encrypted-operational-replica',
    offlineWrites: 'blocked-before-http',
    mutationQueue: false,
    polling: false,
    realtime: false
  });
}

module.exports = {
  patchNativeAdminOffline
};