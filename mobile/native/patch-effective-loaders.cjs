'use strict';

const fs = require('fs');

function fail(kind, label) {
  throw new Error(
    `GARPI_NATIVE_EFFECTIVE_LOAD_PATCH_${kind}:${label}`
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

  const markerEnd =
    first + marker.length;

  const lineEnd =
    text.indexOf(
      '\n',
      markerEnd
    );

  if (lineEnd < 0) {
    fail('MALFORMED', label);
  }

  return (
    text.slice(0, lineEnd + 1) +
    insertion +
    text.slice(lineEnd + 1)
  );
}

function readText(filePath) {
  return fs
    .readFileSync(
      filePath,
      'utf8'
    )
    .replace(/\r\n/g, '\n');
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

function patchHighVolume(
  filePath
) {
  let text =
    readText(filePath);

  const captureBlock = [
    '        try{',
    '          const nativeFoundation=',
    '            window.GARPI_NATIVE_FOUNDATION;',
    '',
    '          if(nativeFoundation?.sync){',
    '            await nativeFoundation.ready;',
    '',
    '            await nativeFoundation.sync.captureRemoteState({',
    '              data:A.data,',
    '              operationalRevision:state.state_version,',
    "              reason:'loadAll'",
    '            });',
    '          }',
    '        }catch(syncError){',
    '          window.dispatchEvent(',
    '            new CustomEvent(',
    "              'garpi:native-sync-error',",
    '              {',
    '                detail:{',
    '                  code:',
    '                    syncError instanceof Error',
    '                      ? syncError.message',
    "                      : 'GARPI_NATIVE_SYNC_CAPTURE_ERROR'",
    '                }',
    '              }',
    '            )',
    '          );',
    '        }',
    ''
  ].join('\n');

  text =
    insertAfterUniqueLine(
      text,
      '        A.consults=[];',
      captureBlock,
      'HIGH_VOLUME_CAPTURE'
    );

  const required = [
    'captureRemoteState',
    'operationalRevision:state.state_version',
    "reason:'loadAll'"
  ];

  for (const marker of required) {
    if (!text.includes(marker)) {
      fail(
        'MARKER_MISSING',
        `HIGH_VOLUME:${marker}`
      );
    }
  }

  writeText(
    filePath,
    text
  );
}

function patchResilience(
  filePath
) {
  let text =
    readText(filePath);

  const offlineBlock = [
    '      const nativeFoundation=',
    '        window.GARPI_NATIVE_FOUNDATION;',
    '',
    '      let nativeNetwork=null;',
    '',
    '      if(nativeFoundation?.sync){',
    '        try{',
    '          await nativeFoundation.ready;',
    '',
    '          nativeNetwork=',
    '            await nativeFoundation.sync.getNetworkStatus();',
    '        }catch(nativeNetworkError){',
    '          console.warn(',
    "            '[GARPI] Native network status unavailable:',",
    '            nativeNetworkError',
    '          );',
    '        }',
    '      }',
    '',
    '      if(',
    '        nativeFoundation?.sync &&',
    '        (',
    '          nativeNetwork?.connected===false ||',
    '          !isOnline()',
    '        )',
    '      ){',
    '        try{',
    '          const replica=',
    '            await nativeFoundation.sync.getOperationalReplica();',
    '',
    '          if(!replica?.data){',
    "            markStale('Sin conexi\\u00f3n');",
    '',
    "            if(typeof window.showMessage==='function'){",
    '              window.showMessage(',
    "                'Sin conexi\\u00f3n y sin copia local disponible.',",
    "                'error'",
    '              );',
    '            }',
    '',
    '            return false;',
    '          }',
    '',
    '          if(!state){',
    '            return false;',
    '          }',
    '',
    '          state.data=replica.data;',
    '',
    '          state.data.workers=state.data.workers||[];',
    '          state.data.inventory=state.data.inventory||[];',
    '          state.data.blocks=state.data.blocks||[];',
    '          state.data.reservations=state.data.reservations||[];',
    '          state.data.movements=state.data.movements||[];',
    '          state.data.capacities=state.data.capacities||[];',
    '          state.data.snapshots=state.data.snapshots||[];',
    '',
    '          state.consults=[];',
    '          state.imports=[];',
    '',
    '          if(replica.operationalRevision!=null){',
    '            state.stateVersion=',
    '              String(replica.operationalRevision);',
    '          }',
    '',
    '          const source=',
    '            state.data.settings?.source_file||',
    "            'Sin planilla';",
    '',
    '          const updated=',
    '            state.data.settings?.last_update||',
    "            '\\u2014';",
    '',
    '          const syncedAt=',
    '            replica.syncedAt||',
    "            'sin fecha';",
    '',
    '          const meta=',
    "            document.getElementById('systemMeta');",
    '',
    '          if(meta){',
    '            meta.textContent=',
    '              `Sin conexi\\u00f3n \\u00b7 copia local ${syncedAt} \\u00b7 ${source} \\u00b7 ${updated}`;',
    '          }',
    '',
    "          markStale('Sin conexi\\u00f3n \\u00b7 copia local');",
    '',
    '          window.__CAMP_DATA_READY__=true;',
    '',
    '          renderAll();',
    '',
    '          window.dispatchEvent?.(',
    '            new CustomEvent(',
    "              'GARPI_NATIVE_OFFLINE_REPLICA_APPLIED',",
    '              {',
    '                detail:{',
    '                  operationalRevision:',
    '                    replica.operationalRevision??null,',
    '                  syncedAt:',
    '                    replica.syncedAt??null',
    '                }',
    '              }',
    '            )',
    '          );',
    '',
    '          return true;',
    '        }catch(offlineReplicaError){',
    "          markStale('Sin conexi\\u00f3n');",
    '',
    "          if(typeof window.showMessage==='function'){",
    '            window.showMessage(',
    '              offlineReplicaError instanceof Error',
    '                ? offlineReplicaError.message',
    "                : 'No fue posible abrir la copia local.',",
    "              'error'",
    '            );',
    '          }',
    '',
    '          return false;',
    '        }',
    '      }',
    ''
  ].join('\n');

  text =
    insertAfterUniqueLine(
      text,
      '    window.loadAll=async function resilientLoadAll(options={}){\n      const state=appState();',
      offlineBlock,
      'RESILIENCE_OFFLINE_REPLICA'
    );

  const required = [
    'getNetworkStatus',
    'getOperationalReplica',
    'GARPI_NATIVE_OFFLINE_REPLICA_APPLIED',
    'state.stateVersion=',
    'renderAll();'
  ];

  for (const marker of required) {
    if (!text.includes(marker)) {
      fail(
        'MARKER_MISSING',
        `RESILIENCE:${marker}`
      );
    }
  }

  writeText(
    filePath,
    text
  );
}

function patchNativeEffectiveLoaders({
  highVolumePath,
  resiliencePath
}) {
  patchHighVolume(
    highVolumePath
  );

  patchResilience(
    resiliencePath
  );

  return Object.freeze({
    highVolumeCapture: true,
    resilienceOfflineReplica: true,
    polling: false,
    realtime: false,
    mutationQueue: false
  });
}

module.exports = {
  patchNativeEffectiveLoaders
};