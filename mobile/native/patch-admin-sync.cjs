'use strict';

const fs = require('fs');

function replaceExactOnce(
  text,
  oldText,
  newText,
  label
) {
  const first =
    text.indexOf(oldText);

  if (first < 0) {
    throw new Error(
      `GARPI_NATIVE_SYNC_PATCH_MISSING:${label}`
    );
  }

  const second =
    text.indexOf(
      oldText,
      first + oldText.length
    );

  if (second >= 0) {
    throw new Error(
      `GARPI_NATIVE_SYNC_PATCH_MULTIPLE:${label}`
    );
  }

  return (
    text.slice(0, first) +
    newText +
    text.slice(
      first + oldText.length
    )
  );
}

function patchNativeAdminSync(filePath) {
  let text =
    fs
      .readFileSync(
        filePath,
        'utf8'
      )
      .replace(/\r\n/g, '\n');

  const captureOld = [
    '    A.imports=',
    '      imports.data||',
    '      [];',
    '',
    '    const source='
  ].join('\n');

  const captureNew = [
    '    A.imports=',
    '      imports.data||',
    '      [];',
    '',
    '    try{',
    '      const nativeFoundation=',
    '        window.GARPI_NATIVE_FOUNDATION;',
    '',
    '      if(nativeFoundation?.sync){',
    '        await nativeFoundation.ready;',
    '',
    '        await nativeFoundation.sync.captureRemoteState({',
    '          data:A.data,',
    '          operationalRevision:state.state_version,',
    "          reason:'loadAll'",
    '        });',
    '      }',
    '    }catch(syncError){',
    '      window.dispatchEvent(',
    '        new CustomEvent(',
    "          'garpi:native-sync-error',",
    '          {',
    '            detail:{',
    '              code:',
    '                syncError instanceof Error',
    '                  ? syncError.message',
    "                  : 'GARPI_NATIVE_SYNC_CAPTURE_ERROR'",
    '            }',
    '          }',
    '        )',
    '      );',
    '    }',
    '',
    '    const source='
  ].join('\n');

  text =
    replaceExactOnce(
      text,
      captureOld,
      captureNew,
      'REMOTE_CAPTURE'
    );

  const reconcileAnchor =
    'function renderAll(){';

  const reconcileBlock = [
    'let nativeReconcileFlight=null;',
    '',
    'async function nativeRevisionReconcile(',
    "  reason='native'",
    '){',
    '  if(nativeReconcileFlight){',
    '    return nativeReconcileFlight;',
    '  }',
    '',
    '  nativeReconcileFlight=',
    '    (async()=>{',
    '      if(!A.token){',
    '        return{status:\'NO_SESSION\'};',
    '      }',
    '',
    '      const foundation=',
    '        window.GARPI_NATIVE_FOUNDATION;',
    '',
    '      if(!foundation?.sync){',
    '        return{status:\'SYNC_UNAVAILABLE\'};',
    '      }',
    '',
    '      await foundation.ready;',
    '',
    '      const network=',
    '        await foundation.sync.getNetworkStatus();',
    '',
    '      if(!network.connected){',
    '        return{status:\'OFFLINE\'};',
    '      }',
    '',
    '      const remote=',
    '        await advApi(',
    "          'revision',",
    '          {',
    '            token:A.token',
    '          }',
    '        );',
    '',
    '      const remoteRevision=',
    '        Number.parseInt(',
    '          String(',
    "            remote?.state_version||''",
    '          ),',
    '          10',
    '        );',
    '',
    '      if(',
    '        !Number.isSafeInteger(remoteRevision)||',
    '        remoteRevision<1',
    '      ){',
    '        throw new Error(',
    "          'GARPI_SYNC_REMOTE_REVISION_INVALID'",
    '        );',
    '      }',
    '',
    '      const comparison=',
    '        await foundation.sync.compareWithRemoteRevision(',
    '          remoteRevision',
    '        );',
    '',
    '      if(',
    '        comparison.relation===\'EQUAL\'',
    '      ){',
    '        return{',
    "          status:'CURRENT',",
    '          reason,',
    '          operationalRevision:',
    '            remoteRevision',
    '        };',
    '      }',
    '',
    '      if(',
    '        comparison.relation===\'LOCAL_AHEAD\'',
    '      ){',
    '        throw new Error(',
    "          'GARPI_SYNC_LOCAL_REVISION_AHEAD'",
    '        );',
    '      }',
    '',
    '      const refresh=',
    '        typeof window.loadAll===\'function\'',
    '          ? window.loadAll',
    '          : loadAll;',
    '',
    '      const ok=',
    '        await refresh({',
    '          snapshot:false',
    '        });',
    '',
    '      if(!ok){',
    '        throw new Error(',
    "          'GARPI_SYNC_REFRESH_FAILED'",
    '        );',
    '      }',
    '',
    '      const after=',
    '        await foundation.sync.getSyncState();',
    '',
    '      const afterRevision=',
    '        Number(',
    '          after?.operationalRevision||0',
    '        );',
    '',
    '      if(afterRevision<remoteRevision){',
    '        throw new Error(',
    "          'GARPI_SYNC_RECONCILE_INCOMPLETE'",
    '        );',
    '      }',
    '',
    '      return{',
    "        status:'REFRESHED',",
    '        reason,',
    '        operationalRevision:',
    '          afterRevision',
    '      };',
    '    })()',
    '      .finally(()=>{',
    '        nativeReconcileFlight=null;',
    '      });',
    '',
    '  return nativeReconcileFlight;',
    '}',
    '',
    'window.addEventListener(',
    "  'garpi:native-reconcile-request',",
    '  event=>{',
    '    void nativeRevisionReconcile(',
    "      event?.detail?.reason||'native'",
    '    ).catch(error=>{',
    '      window.dispatchEvent(',
    '        new CustomEvent(',
    "          'garpi:native-sync-error',",
    '          {',
    '            detail:{',
    '              code:',
    '                error instanceof Error',
    '                  ? error.message',
    "                  : 'GARPI_NATIVE_RECONCILE_ERROR'",
    '            }',
    '          }',
    '        )',
    '      );',
    '    });',
    '  }',
    ');',
    '',
    'window.GARPI_NATIVE_RECONCILE=',
    '  nativeRevisionReconcile;',
    '',
    'function renderAll(){'
  ].join('\n');

  text =
    replaceExactOnce(
      text,
      reconcileAnchor,
      reconcileBlock,
      'REVISION_RECONCILE'
    );

  const required = [
    'captureRemoteState',
    'GARPI_NATIVE_RECONCILE',
    "advApi(\n          'revision'",
    'snapshot:false',
    'compareWithRemoteRevision'
  ];

  for (const marker of required) {
    if (!text.includes(marker)) {
      throw new Error(
        `GARPI_NATIVE_SYNC_MARKER_MISSING:${marker}`
      );
    }
  }

  if (
    text.includes(
      'setInterval('
    )
  ) {
    throw new Error(
      'GARPI_NATIVE_SYNC_POLLING_FORBIDDEN'
    );
  }

  fs.writeFileSync(
    filePath,
    text,
    'utf8'
  );

  return Object.freeze({
    revisionReconciliation: true,
    sqliteCapture: true,
    polling: false
  });
}

module.exports = {
  patchNativeAdminSync
};
