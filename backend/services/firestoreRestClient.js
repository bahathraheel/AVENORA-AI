import crypto from 'node:crypto';
import { FIREBASE_PROJECT_ID, getFirebaseDatabaseId } from '../config/firebaseAdmin.js';

function getDatabaseResourcePath() {
  const dbId = getFirebaseDatabaseId();
  return `projects/${FIREBASE_PROJECT_ID}/databases/${dbId}`;
}

function getDocumentsRootUrl() {
  return `https://firestore.googleapis.com/v1/${getDatabaseResourcePath()}/documents`;
}

function encodeValue(val) {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeValue(item))
      }
    };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFields(obj = {}) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      fields[key] = encodeValue(val);
    }
  }
  return fields;
}

function parseTimestamp(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1e6
  };
}

function decodeValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return parseTimestamp(val.timestampValue);
  if ('arrayValue' in val) {
    return Array.isArray(val.arrayValue?.values)
      ? val.arrayValue.values.map(decodeValue)
      : [];
  }
  if ('mapValue' in val) {
    const out = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeValue(v);
    }
    return out;
  }
  return null;
}

function decodeDocument(doc) {
  if (!doc || !doc.name) return null;
  const parts = doc.name.split('/');
  const id = parts[parts.length - 1];
  const out = { id };
  const fields = doc.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

async function firestoreFetch(url, idToken, options = {}) {
  if (!idToken) {
    const err = new Error('Authentication token missing for database request.');
    err.statusCode = 401;
    throw err;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Firestore request failed (${res.status}).`;
    const err = new Error(msg);
    err.statusCode = res.status === 404 ? 404 : res.status === 403 ? 403 : res.status >= 400 ? res.status : 500;
    err.code = data?.error?.status || res.status;
    throw err;
  }
  return data;
}

export function generateFirestoreDocId() {
  return crypto.randomBytes(10).toString('hex');
}

export async function getDocRest(docPath, idToken) {
  try {
    const doc = await firestoreFetch(`${getDocumentsRootUrl()}/${docPath}`, idToken);
    return decodeDocument(doc);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

export async function listCollectionRest(parentDocPath, collectionId, uid, idToken) {
  const baseUrl = parentDocPath
    ? `${getDocumentsRootUrl()}/${parentDocPath}:runQuery`
    : `${getDocumentsRootUrl()}:runQuery`;

  const rows = await firestoreFetch(baseUrl, idToken, {
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ownerId' },
            op: 'EQUAL',
            value: { stringValue: uid }
          }
        }
      }
    }
  });

  if (!Array.isArray(rows)) return [];
  return rows
    .filter((entry) => entry?.document)
    .map((entry) => decodeDocument(entry.document));
}

export async function commitWritesRest(writes, idToken) {
  if (!Array.isArray(writes) || writes.length === 0) return {};
  return firestoreFetch(`${getDocumentsRootUrl()}:commit`, idToken, {
    method: 'POST',
    body: { writes }
  });
}

export function buildCreateWrite(docPath, data, serverTimeFields = ['createdAt', 'updatedAt']) {
  const fullName = `${getDatabaseResourcePath()}/documents/${docPath}`;
  const cleanData = { ...data };
  for (const field of serverTimeFields) {
    delete cleanData[field];
  }

  return {
    update: {
      name: fullName,
      fields: encodeFields(cleanData)
    },
    currentDocument: { exists: false },
    ...(serverTimeFields.length > 0
      ? {
          updateTransforms: serverTimeFields.map((fieldPath) => ({
            fieldPath,
            setToServerValue: 'REQUEST_TIME'
          }))
        }
      : {})
  };
}

export function buildUpdateWrite(docPath, updates, serverTimeFields = ['updatedAt']) {
  const fullName = `${getDatabaseResourcePath()}/documents/${docPath}`;
  const cleanUpdates = { ...updates };
  for (const field of serverTimeFields) {
    delete cleanUpdates[field];
  }
  const fieldPaths = Object.keys(cleanUpdates);

  return {
    update: {
      name: fullName,
      fields: encodeFields(cleanUpdates)
    },
    ...(fieldPaths.length > 0 ? { updateMask: { fieldPaths } } : {}),
    currentDocument: { exists: true },
    ...(serverTimeFields.length > 0
      ? {
          updateTransforms: serverTimeFields.map((fieldPath) => ({
            fieldPath,
            setToServerValue: 'REQUEST_TIME'
          }))
        }
      : {})
  };
}

export function buildDeleteWrite(docPath) {
  return {
    delete: `${getDatabaseResourcePath()}/documents/${docPath}`
  };
}

export async function createDocRest(collectionPath, docId, data, serverTimeFields, idToken) {
  const safeDocId = docId || generateFirestoreDocId();
  const docPath = `${collectionPath}/${safeDocId}`;
  await commitWritesRest([buildCreateWrite(docPath, data, serverTimeFields)], idToken);
  return getDocRest(docPath, idToken);
}

export async function updateDocRest(docPath, updates, serverTimeFields, idToken) {
  await commitWritesRest([buildUpdateWrite(docPath, updates, serverTimeFields)], idToken);
  return getDocRest(docPath, idToken);
}

export async function deleteDocRest(docPath, idToken) {
  await commitWritesRest([buildDeleteWrite(docPath)], idToken);
}
