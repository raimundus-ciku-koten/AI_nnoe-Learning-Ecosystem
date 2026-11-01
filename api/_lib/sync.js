const {
  HttpError,
  adminRequest,
} = require('./common.js');
const {
  accessTokenForConnection,
  getConnection,
  requestGoogle,
} = require('./google.js');

const RESOURCE = Object.freeze({ drive: 'files', tasks: 'tasks', calendar: 'events' });
const SYNC_PAGE_LIMIT = 5;

function googleUrl(service, resource, action, params = {}) {
  const base = service === 'drive'
    ? 'https://www.googleapis.com/drive/v3'
    : service === 'tasks'
      ? 'https://tasks.googleapis.com/tasks/v1'
      : 'https://www.googleapis.com/calendar/v3';
  let path;
  if (service === 'drive' && action === 'changes') path = '/changes';
  else if (service === 'drive' && action === 'startToken') path = '/changes/startPageToken';
  else if (service === 'drive') path = '/files';
  else if (service === 'tasks') path = '/lists/@default/tasks';
  else path = '/calendars/primary/events';
  if (action === 'item') {
    path += `/${encodeURIComponent(resource)}`;
  } else if (action === 'taskItem') {
    path = `/lists/@default/tasks/${encodeURIComponent(resource)}`;
  } else if (action === 'eventItem') {
    path = `/calendars/primary/events/${encodeURIComponent(resource)}`;
  }
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeItem(service, item) {
  if (service === 'drive') {
    return {
      id: item.id,
      etag: item.etag || null,
      updated: item.modifiedTime || null,
      deleted: item.trashed === true,
      payload: {
        name: item.name || '',
        mimeType: item.mimeType || '',
        modifiedTime: item.modifiedTime || null,
        webViewLink: item.webViewLink || null,
        md5Checksum: item.md5Checksum || null,
        size: item.size || null,
        parents: Array.isArray(item.parents) ? item.parents : [],
        trashed: item.trashed === true,
      },
    };
  }
  if (service === 'tasks') {
    return {
      id: item.id,
      etag: item.etag || null,
      updated: item.updated || null,
      deleted: item.deleted === true,
      payload: {
        title: item.title || '',
        notes: item.notes || '',
        status: item.status || 'needsAction',
        due: item.due || null,
        completed: item.completed || null,
        updated: item.updated || null,
        deleted: item.deleted === true,
        position: item.position || null,
      },
    };
  }
  return {
    id: item.id,
    etag: item.etag || null,
    updated: item.updated || null,
    deleted: item.status === 'cancelled',
    payload: {
      summary: item.summary || '',
      description: item.description || '',
      start: item.start || null,
      end: item.end || null,
      status: item.status || 'confirmed',
      updated: item.updated || null,
      recurrence: Array.isArray(item.recurrence) ? item.recurrence : [],
      htmlLink: item.htmlLink || null,
    },
  };
}

async function saveItems(userId, service, items) {
  if (!items.length) return;
  const resource = RESOURCE[service];
  const rows = items.filter((item) => item?.id).map((item) => {
    const normalized = normalizeItem(service, item);
    return {
      user_id: userId,
      service,
      resource,
      remote_id: normalized.id,
      etag: normalized.etag,
      remote_updated_at: normalized.updated,
      deleted_at: normalized.deleted ? new Date().toISOString() : null,
      normalized_payload: normalized.payload,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length) {
    await adminRequest(`integration_items?on_conflict=user_id,service,resource,remote_id`, {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: rows,
    });
  }
}

async function writeSyncState(userId, service, updates) {
  await adminRequest('integration_sync_state?on_conflict=user_id,service,resource', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      user_id: userId,
      service,
      resource: RESOURCE[service],
      updated_at: new Date().toISOString(),
      ...updates,
    },
  });
}

async function getSyncState(userId, service) {
  const rows = await adminRequest(
    `integration_sync_state?user_id=eq.${encodeURIComponent(userId)}&service=eq.${service}&resource=eq.${RESOURCE[service]}&select=cursor,page_cursor&limit=1`,
  );
  return rows?.[0] || { cursor: null, page_cursor: null };
}

function decodePageCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(value);
    if (!cursor || typeof cursor !== 'object' || typeof cursor.phase !== 'string') throw new Error();
    return cursor;
  } catch {
    throw new HttpError(500, 'Cursor sinkronisasi rusak dan perlu di-reset.', 'sync_cursor_invalid');
  }
}

async function syncGoogleService(userId, service, fullResync = false) {
  if (!RESOURCE[service]) throw new HttpError(400, 'Layanan sinkronisasi tidak dikenal.', 'service_invalid');
  const connection = await getConnection(userId, service);
  const accessToken = await accessTokenForConnection(connection);
  let state = await getSyncState(userId, service);
  let pageCursor = decodePageCursor(state.page_cursor);
  const beganAt = new Date().toISOString();
  await writeSyncState(userId, service, {
    cursor: state.cursor,
    page_cursor: state.page_cursor,
    status: 'syncing',
    last_started_at: beganAt,
    last_error_code: null,
  });

  if (service === 'drive' && !state.cursor && !pageCursor) {
    const { data } = await requestGoogle(googleUrl(service, RESOURCE[service], 'startToken', { fields: 'startPageToken' }), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    state.cursor = data.startPageToken;
    pageCursor = { phase: 'files', pageToken: null };
    await writeSyncState(userId, service, { cursor: state.cursor, page_cursor: JSON.stringify(pageCursor) });
  }
  if (service === 'drive' && pageCursor?.phase === 'files') {
    let pageToken = pageCursor.pageToken;
    let pages = 0;
    while (pages < SYNC_PAGE_LIMIT) {
      const { data } = await requestGoogle(googleUrl(service, RESOURCE[service], 'list', {
        pageSize: 1000,
        pageToken,
        q: 'trashed = false',
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum,size,parents,trashed,etag)',
      }), { headers: { Authorization: `Bearer ${accessToken}` } });
      await saveItems(userId, service, data.files || []);
      pages += 1;
      pageToken = data.nextPageToken || null;
      if (!pageToken) {
        pageCursor = { phase: 'changes', pageToken: state.cursor };
        break;
      }
    }
    if (pageToken) pageCursor = { phase: 'files', pageToken };
    const hasMore = pageCursor?.phase === 'files' || Boolean(pageToken);
    await writeSyncState(userId, service, {
      cursor: state.cursor,
      page_cursor: JSON.stringify(pageCursor),
      status: hasMore ? 'syncing' : 'connected',
      retry_count: 0,
      last_success_at: hasMore ? null : new Date().toISOString(),
    });
    if (hasMore) return { service, resource: RESOURCE[service], pages, hasMore: true };
  }

  if (service === 'drive') {
    pageCursor = pageCursor || { phase: 'changes', pageToken: state.cursor };
    let pageToken = pageCursor.pageToken || state.cursor;
    let pages = 0;
    let nextCursor = state.cursor;
    try {
    while (pages < SYNC_PAGE_LIMIT) {
      const { data } = await requestGoogle(googleUrl(service, RESOURCE[service], 'changes', {
        pageToken,
        pageSize: 1000,
        includeRemoved: true,
        fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,webViewLink,md5Checksum,size,parents,trashed,etag))',
      }), { headers: { Authorization: `Bearer ${accessToken}` } });
      const changes = data.changes || [];
      const changedItems = changes.filter((change) => change.file).map((change) => (
        change.removed ? { ...change.file, trashed: true } : change.file
      ));
      await saveItems(userId, service, changedItems);
      const removedIds = changes.filter((change) => change.removed && !change.file).map((change) => change.fileId);
      if (removedIds.length) {
        const rows = removedIds.map((id) => ({
          user_id: userId,
          service,
          resource: RESOURCE[service],
          remote_id: id,
          deleted_at: new Date().toISOString(),
          normalized_payload: {},
          updated_at: new Date().toISOString(),
        }));
        await adminRequest('integration_items?on_conflict=user_id,service,resource,remote_id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: rows,
        });
      }
      pages += 1;
      if (data.nextPageToken) pageToken = data.nextPageToken;
      else {
        nextCursor = data.newStartPageToken || state.cursor;
        pageToken = null;
        break;
      }
    }
    } catch (error) {
      if (error.code !== 'google_sync_token_invalid' || fullResync) throw error;
      await writeSyncState(userId, service, {
        cursor: null,
        page_cursor: null,
        status: 'syncing',
      });
      return syncGoogleService(userId, service, true);
    }
    const hasMore = Boolean(pageToken);
    await writeSyncState(userId, service, {
      cursor: nextCursor,
      page_cursor: hasMore ? JSON.stringify({ phase: 'changes', pageToken }) : null,
      status: hasMore ? 'syncing' : 'connected',
      retry_count: 0,
      last_success_at: hasMore ? null : new Date().toISOString(),
    });
    return { service, resource: RESOURCE[service], pages, hasMore };
  }

  const phase = pageCursor?.phase || (service === 'calendar' && state.cursor ? 'incremental' : 'full');
  if (service === 'calendar' && phase === 'incremental' && state.cursor) {
    let pageToken = pageCursor?.pageToken || null;
    let pages = 0;
    let finalCursor = state.cursor;
    try {
      while (pages < SYNC_PAGE_LIMIT) {
        const { data } = await requestGoogle(googleUrl(service, RESOURCE[service], 'list', {
          syncToken: state.cursor,
          pageToken,
          maxResults: 2500,
          showDeleted: true,
          singleEvents: false,
        }), { headers: { Authorization: `Bearer ${accessToken}` } });
        await saveItems(userId, service, data.items || []);
        pages += 1;
        if (data.nextPageToken) pageToken = data.nextPageToken;
        else {
          finalCursor = data.nextSyncToken || state.cursor;
          pageToken = null;
          break;
        }
      }
      const hasMore = Boolean(pageToken);
      await writeSyncState(userId, service, {
        cursor: finalCursor,
        page_cursor: hasMore ? JSON.stringify({ phase: 'incremental', pageToken }) : null,
        status: hasMore ? 'syncing' : 'connected',
        retry_count: 0,
        last_success_at: hasMore ? null : new Date().toISOString(),
      });
      return { service, resource: RESOURCE[service], pages, hasMore };
    } catch (error) {
      if (error.code !== 'google_sync_token_invalid') throw error;
      state = { cursor: null, page_cursor: null };
      pageCursor = null;
    }
  }

  let pageToken = pageCursor?.pageToken || null;
  let pages = 0;
  let finalCursor = state.cursor;
  while (pages < SYNC_PAGE_LIMIT) {
    const params = service === 'tasks'
      ? {
          maxResults: 100,
          pageToken,
          showDeleted: true,
          updatedMin: state.cursor ? new Date(Date.parse(state.cursor) - 120000).toISOString() : undefined,
        }
      : { maxResults: 2500, pageToken, showDeleted: true, singleEvents: false };
    const { data } = await requestGoogle(googleUrl(service, RESOURCE[service], 'list', params), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await saveItems(userId, service, data.items || []);
    pages += 1;
    if (data.nextPageToken) pageToken = data.nextPageToken;
    else {
      pageToken = null;
      finalCursor = service === 'calendar'
        ? data.nextSyncToken || state.cursor
        : new Date().toISOString();
      break;
    }
  }
  const hasMore = Boolean(pageToken);
  await writeSyncState(userId, service, {
    cursor: finalCursor,
    page_cursor: hasMore ? JSON.stringify({ phase: service === 'calendar' ? 'full' : 'tasks', pageToken }) : null,
    status: hasMore ? 'syncing' : 'connected',
    retry_count: 0,
    last_success_at: hasMore ? null : new Date().toISOString(),
  });
  return { service, resource: RESOURCE[service], pages, hasMore };
}

function itemEndpoint(service, resourceId) {
  if (service === 'drive') return googleUrl(service, resourceId, 'item');
  if (service === 'tasks') return googleUrl(service, resourceId, 'taskItem');
  return googleUrl(service, resourceId, 'eventItem');
}

function allowedPayload(service, payload) {
  const fields = service === 'drive'
    ? ['name', 'mimeType', 'description', 'parents', 'trashed']
    : service === 'tasks'
      ? ['title', 'notes', 'status', 'due']
      : ['summary', 'description', 'start', 'end', 'status', 'recurrence'];
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(payload || {}, field))
    .map((field) => [field, payload[field]]));
}

async function mutateGoogleItem(userId, service, mutation) {
  const { mutationId, operation, remoteId, baseEtag, payload } = mutation || {};
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(mutationId || ''))) {
    throw new HttpError(400, 'ID mutasi idempoten tidak valid.', 'mutation_id_invalid');
  }
  if (!['create', 'update', 'delete'].includes(operation)) {
    throw new HttpError(400, 'Operasi sinkronisasi tidak valid.', 'mutation_operation_invalid');
  }
  const replay = await adminRequest(
    `integration_mutations?user_id=eq.${encodeURIComponent(userId)}&mutation_id=eq.${encodeURIComponent(mutationId)}&select=result&limit=1`,
  );
  if (replay?.[0]) return { replayed: true, result: replay[0].result };
  const safePayload = allowedPayload(service, payload);
  if (operation !== 'delete' && !Object.keys(safePayload).length) {
    throw new HttpError(400, 'Tidak ada bidang yang dapat disinkronkan.', 'mutation_payload_invalid');
  }
  const connection = await getConnection(userId, service);
  const accessToken = await accessTokenForConnection(connection);
  let current = null;
  if (operation !== 'create') {
    if (!remoteId || String(remoteId).length > 512) throw new HttpError(400, 'ID item Google tidak valid.', 'remote_id_invalid');
    if (!baseEtag) throw new HttpError(428, 'Versi dasar item diperlukan untuk mencegah overwrite tanpa pemeriksaan.', 'base_etag_required');
    const response = await requestGoogle(itemEndpoint(service, remoteId), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    current = response.data;
    if (!current.etag || current.etag !== baseEtag) {
      const localSnapshot = { operation, payload: safePayload, baseEtag };
      const remoteSnapshot = { ...normalizeItem(service, current).payload, etag: current.etag };
      await saveItems(userId, service, [current]);
      await adminRequest('integration_conflicts', {
        method: 'POST',
        prefer: 'return=minimal',
        body: {
          user_id: userId,
          service,
          resource: RESOURCE[service],
          remote_id: remoteId,
          base_etag: baseEtag,
          local_snapshot: localSnapshot,
          remote_snapshot: remoteSnapshot,
        },
      });
      throw new HttpError(409, 'Konflik ditemukan. Kedua versi disimpan untuk ditinjau; data Google tidak ditimpa.', 'sync_conflict');
    }
  }

  let result;
  if (operation === 'create') {
    const collection = googleUrl(service, RESOURCE[service], 'list');
    result = (await requestGoogle(collection, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(safePayload),
    })).data;
  } else if (operation === 'delete' && service === 'drive') {
    result = (await requestGoogle(itemEndpoint(service, remoteId), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'If-Match': current.etag || '' },
      body: JSON.stringify({ trashed: true }),
    })).data;
  } else if (operation === 'delete') {
    await requestGoogle(itemEndpoint(service, remoteId), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, ...(current.etag ? { 'If-Match': current.etag } : {}) },
    });
    result = { id: remoteId, deleted: true };
  } else {
    result = (await requestGoogle(itemEndpoint(service, remoteId), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, ...(current.etag ? { 'If-Match': current.etag } : {}) },
      body: JSON.stringify(safePayload),
    })).data;
  }

  await saveItems(userId, service, [result]);
  await adminRequest('integration_mutations', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      user_id: userId,
      mutation_id: mutationId,
      service,
      resource: RESOURCE[service],
      remote_id: result?.id || remoteId || null,
      result: { id: result?.id || remoteId, etag: result?.etag || null, deleted: operation === 'delete' },
    },
  });
  return { replayed: false, result: { id: result?.id || remoteId, etag: result?.etag || null } };
}

module.exports = {
  RESOURCE,
  mutateGoogleItem,
  normalizeItem,
  syncGoogleService,
};
