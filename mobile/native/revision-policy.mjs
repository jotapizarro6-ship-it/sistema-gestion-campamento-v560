'use strict';

export function normalizeOperationalRevision(
  value,
  {
    allowNull = false
  } = {}
) {
  if (
    allowNull &&
    (
      value === null ||
      value === undefined ||
      String(value).trim() === ''
    )
  ) {
    return null;
  }

  const text =
    String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    throw new Error(
      'GARPI_SYNC_INVALID_OPERATIONAL_REVISION'
    );
  }

  const revision =
    Number.parseInt(text, 10);

  if (
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new Error(
      'GARPI_SYNC_INVALID_OPERATIONAL_REVISION'
    );
  }

  return revision;
}

export function compareOperationalRevisions(
  localRevision,
  remoteRevision
) {
  const local =
    normalizeOperationalRevision(
      localRevision,
      {
        allowNull: true
      }
    );

  const remote =
    normalizeOperationalRevision(
      remoteRevision
    );

  if (local === null) {
    return Object.freeze({
      relation: 'MISSING',
      local: null,
      remote,
      refreshRequired: true
    });
  }

  if (local === remote) {
    return Object.freeze({
      relation: 'EQUAL',
      local,
      remote,
      refreshRequired: false
    });
  }

  if (local < remote) {
    return Object.freeze({
      relation: 'REMOTE_NEWER',
      local,
      remote,
      refreshRequired: true
    });
  }

  return Object.freeze({
    relation: 'LOCAL_AHEAD',
    local,
    remote,
    refreshRequired: true
  });
}
