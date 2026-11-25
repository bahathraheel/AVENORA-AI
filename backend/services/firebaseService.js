import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, assertFirebaseAdminReady, hasAdminCredentials } from '../config/firebaseAdmin.js';
import { getCurrentUserToken } from '../utils/authContext.js';
import {
  buildCreateWrite,
  buildDeleteWrite,
  buildUpdateWrite,
  commitWritesRest,
  createDocRest,
  deleteDocRest,
  generateFirestoreDocId,
  getDocRest,
  listCollectionRest,
  updateDocRest
} from './firestoreRestClient.js';
import {
  clampInt,
  sanitizeBlueprint,
  sanitizeEnum,
  sanitizeHexColor,
  sanitizeId,
  sanitizeIsoDate,
  sanitizeMoodboardSpecs,
  sanitizePositiveNumber,
  sanitizeText,
  serializeFirestoreValue
} from '../utils/sanitize.js';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
const EVENT_STATUSES = ['planning', 'in_progress', 'ready', 'completed'];
const TASK_PRIORITIES = ['high', 'medium', 'low'];
const TASK_STATUSES = ['pending', 'completed'];
const EXPENSE_PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];
const GUEST_GROUPS = ['Family', 'Friends', 'Colleagues', 'VIP', 'Other'];
const GUEST_RSVP_STATUSES = ['pending', 'confirmed', 'declined'];
const GUEST_INVITATION_STATUSES = ['not_sent', 'sent', 'opened'];
const GUEST_ATTENDANCE_STATUSES = ['not_checked_in', 'attended', 'absent'];
const VENDOR_STATUSES = ['shortlisted', 'contacted', 'booked', 'paid', 'declined'];
const VENDOR_PAYMENT_STATUSES = ['unpaid', 'deposit_paid', 'paid'];

function formatDoc(docSnap) {
  return serializeFirestoreValue({ id: docSnap.id, ...docSnap.data() });
}

function resolveRestToken(explicitToken) {
  const token = explicitToken || getCurrentUserToken();
  if (!token) {
    const err = new Error('Authentication required to access Firebase Firestore.');
    err.statusCode = 401;
    throw err;
  }
  return token;
}

function userDocRef(uid) {
  assertFirebaseAdminReady();
  return adminDb.collection('users').doc(uid);
}

function eventDocRef(uid, eventId) {
  assertFirebaseAdminReady();
  const safeEventId = sanitizeId(eventId);
  if (!safeEventId) {
    const err = new Error('Invalid event identifier.');
    err.statusCode = 400;
    throw err;
  }
  return userDocRef(uid).collection('events').doc(safeEventId);
}

async function assertEventOwnership(uid, eventId, explicitToken = '') {
  const safeEventId = sanitizeId(eventId);
  if (!safeEventId) {
    const err = new Error('Invalid event identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const ref = eventDocRef(uid, safeEventId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Event workspace not found.');
      err.statusCode = 404;
      throw err;
    }
    return { ref, snap, data: formatDoc(snap), safeEventId };
  }

  const token = resolveRestToken(explicitToken);
  const data = await getDocRest(`users/${uid}/events/${safeEventId}`, token);
  if (!data || data.ownerId !== uid) {
    const err = new Error('Event workspace not found.');
    err.statusCode = 404;
    throw err;
  }
  return { ref: null, snap: null, data, safeEventId, token };
}

// ---------------------------------------------------------------------------
// User Profile Operations (users/{uid})
// ---------------------------------------------------------------------------

export async function ensureUserProfile(userInfo, explicitToken = '') {
  const uid = sanitizeId(userInfo?.uid);
  if (!uid) {
    const err = new Error('Invalid user ID.');
    err.statusCode = 400;
    throw err;
  }

  const email = sanitizeText(userInfo.email || '', 180);
  const fallbackName = email ? email.split('@')[0] : 'Event Planner';
  const displayName = sanitizeText(userInfo.displayName || fallbackName || 'Event Planner', 120) || 'Event Planner';

  const baseProfile = {
    uid,
    displayName,
    email,
    preferredCurrency: 'USD',
    notificationsEnabled: true,
    deadlineReminders: true,
    aiDigestEnabled: true,
    roleNote: ''
  };

  if (hasAdminCredentials()) {
    const ref = userDocRef(uid);
    const snap = await ref.get();
    if (snap.exists) {
      return serializeFirestoreValue(snap.data());
    }
    await ref.set({
      ...baseProfile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    const createdSnap = await ref.get();
    return serializeFirestoreValue(createdSnap.data());
  }

  const token = resolveRestToken(explicitToken);
  const existing = await getDocRest(`users/${uid}`, token);
  if (existing) {
    return existing;
  }

  return createDocRest('users', uid, baseProfile, ['createdAt', 'updatedAt'], token);
}

export async function updateUserProfile(uid, payload = {}, explicitToken = '') {
  const updates = {};
  if (typeof payload.displayName === 'string' && payload.displayName.trim()) {
    updates.displayName = sanitizeText(payload.displayName, 120);
  }
  if (typeof payload.preferredCurrency === 'string') {
    updates.preferredCurrency = sanitizeEnum(payload.preferredCurrency, CURRENCIES, 'USD');
  }
  if (typeof payload.roleNote === 'string') {
    updates.roleNote = sanitizeText(payload.roleNote, 120);
  }
  if (typeof payload.notificationsEnabled === 'boolean') {
    updates.notificationsEnabled = payload.notificationsEnabled;
  }
  if (typeof payload.deadlineReminders === 'boolean') {
    updates.deadlineReminders = payload.deadlineReminders;
  }
  if (typeof payload.aiDigestEnabled === 'boolean') {
    updates.aiDigestEnabled = payload.aiDigestEnabled;
  }

  if (hasAdminCredentials()) {
    const ref = userDocRef(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ensureUserProfile({ uid, email: payload.email || '', displayName: payload.displayName || '' });
    }
    await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    const fresh = await ref.get();
    return serializeFirestoreValue(fresh.data());
  }

  const token = resolveRestToken(explicitToken);
  const existing = await getDocRest(`users/${uid}`, token);
  if (!existing) {
    await ensureUserProfile({ uid, email: payload.email || '', displayName: payload.displayName || '' }, token);
  }
  return updateDocRest(`users/${uid}`, updates, ['updatedAt'], token);
}

// ---------------------------------------------------------------------------
// Events Operations (users/{uid}/events/{eventId})
// ---------------------------------------------------------------------------

export async function listEvents(uid, explicitToken = '') {
  if (hasAdminCredentials()) {
    const snap = await userDocRef(uid).collection('events').where('ownerId', '==', uid).get();
    return snap.docs
      .map(formatDoc)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  const token = resolveRestToken(explicitToken);
  const rows = await listCollectionRest(`users/${uid}`, 'events', uid, token);
  return rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

export async function getEvent(uid, eventId, explicitToken = '') {
  const { data } = await assertEventOwnership(uid, eventId, explicitToken);
  return data;
}

export async function createEvent(uid, payload = {}, explicitToken = '') {
  const name = sanitizeText(payload.name || '', 160);
  const date = sanitizeIsoDate(payload.date || '');
  const location = sanitizeText(payload.location || '', 200);
  if (!name || !date || !location) {
    const err = new Error('Event name, date, and location are required.');
    err.statusCode = 400;
    throw err;
  }

  const docData = {
    ownerId: uid,
    name,
    type: sanitizeText(payload.type || 'Custom Event', 64) || 'Custom Event',
    date,
    location,
    guestCount: clampInt(payload.guestCount, 1, 100000, 1),
    budget: sanitizePositiveNumber(payload.budget, 0, 1000000000),
    currency: sanitizeEnum(payload.currency || 'USD', CURRENCIES, 'USD'),
    style: sanitizeText(payload.style || 'Modern', 64) || 'Modern',
    preferences: sanitizeText(payload.preferences || '', 1500),
    specialRequirements: sanitizeText(payload.specialRequirements || '', 1500),
    status: 'planning'
  };

  if (payload.blueprint && typeof payload.blueprint === 'object') {
    docData.blueprint = sanitizeBlueprint(payload.blueprint);
  }

  if (hasAdminCredentials()) {
    const ref = await userDocRef(uid).collection('events').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    const created = await ref.get();
    return formatDoc(created);
  }

  const token = resolveRestToken(explicitToken);
  return createDocRest(`users/${uid}/events`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function updateEvent(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const updates = {};

  if (typeof payload.name === 'string' && payload.name.trim()) {
    updates.name = sanitizeText(payload.name, 160);
  }
  if (typeof payload.type === 'string' && payload.type.trim()) {
    updates.type = sanitizeText(payload.type, 64);
  }
  if (typeof payload.date === 'string' && payload.date.trim()) {
    const validDate = sanitizeIsoDate(payload.date);
    if (!validDate) {
      const err = new Error('Event date must be a valid YYYY-MM-DD date.');
      err.statusCode = 400;
      throw err;
    }
    updates.date = validDate;
  }
  if (typeof payload.location === 'string' && payload.location.trim()) {
    updates.location = sanitizeText(payload.location, 200);
  }
  if (payload.guestCount !== undefined) {
    updates.guestCount = clampInt(payload.guestCount, 1, 100000, 1);
  }
  if (payload.budget !== undefined) {
    updates.budget = sanitizePositiveNumber(payload.budget, 0, 1000000000);
  }
  if (typeof payload.currency === 'string') {
    updates.currency = sanitizeEnum(payload.currency, CURRENCIES, 'USD');
  }
  if (typeof payload.style === 'string') {
    updates.style = sanitizeText(payload.style, 64);
  }
  if (typeof payload.preferences === 'string') {
    updates.preferences = sanitizeText(payload.preferences, 1500);
  }
  if (typeof payload.specialRequirements === 'string') {
    updates.specialRequirements = sanitizeText(payload.specialRequirements, 1500);
  }
  if (typeof payload.status === 'string') {
    updates.status = sanitizeEnum(payload.status, EVENT_STATUSES, 'planning');
  }

  if (hasAdminCredentials()) {
    await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    const fresh = await ref.get();
    return formatDoc(fresh);
  }

  return updateDocRest(`users/${uid}/events/${safeEventId}`, updates, ['updatedAt'], token);
}

export async function updateEventBlueprint(uid, eventId, blueprint, explicitToken = '') {
  const safeBlueprint = sanitizeBlueprint(blueprint);
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);

  if (hasAdminCredentials()) {
    await ref.update({
      blueprint: safeBlueprint,
      updatedAt: FieldValue.serverTimestamp()
    });
    const fresh = await ref.get();
    return formatDoc(fresh);
  }

  return updateDocRest(`users/${uid}/events/${safeEventId}`, { blueprint: safeBlueprint }, ['updatedAt'], token);
}

export async function deleteEvent(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const subcollections = ['tasks', 'expenses', 'guests', 'vendors', 'timeline', 'chats', 'themes'];

  if (hasAdminCredentials()) {
    for (const sub of subcollections) {
      const snap = await ref.collection(sub).get();
      if (!snap.empty) {
        const batch = adminDb.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await ref.delete();
    return { deleted: true, id: safeEventId };
  }

  const writes = [];
  for (const sub of subcollections) {
    const docs = await listCollectionRest(`users/${uid}/events/${safeEventId}`, sub, uid, token);
    for (const doc of docs) {
      writes.push(buildDeleteWrite(`users/${uid}/events/${safeEventId}/${sub}/${doc.id}`));
    }
  }
  writes.push(buildDeleteWrite(`users/${uid}/events/${safeEventId}`));

  for (let i = 0; i < writes.length; i += 400) {
    await commitWritesRest(writes.slice(i, i + 400), token);
  }
  return { deleted: true, id: safeEventId };
}

// ---------------------------------------------------------------------------
// Expenses Operations (users/{uid}/events/{eventId}/expenses/{expenseId})
// ---------------------------------------------------------------------------

export async function listExpenses(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('expenses').where('ownerId', '==', uid).get();
    return snap.docs.map(formatDoc);
  }
  return listCollectionRest(`users/${uid}/events/${safeEventId}`, 'expenses', uid, token);
}

export async function createExpense(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const title = sanitizeText(payload.title || '', 180);
  if (!title) {
    const err = new Error('Expense title is required.');
    err.statusCode = 400;
    throw err;
  }
  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    title,
    category: sanitizeText(payload.category || 'Miscellaneous', 64) || 'Miscellaneous',
    vendorId: sanitizeText(payload.vendorId || '', 128),
    vendorName: sanitizeText(payload.vendorName || '', 160),
    estimatedCost: sanitizePositiveNumber(payload.estimatedCost, 0),
    actualCost: sanitizePositiveNumber(payload.actualCost, 0),
    paymentStatus: sanitizeEnum(payload.paymentStatus || 'unpaid', EXPENSE_PAYMENT_STATUSES, 'unpaid'),
    expenseDate: sanitizeIsoDate(payload.expenseDate || ''),
    notes: sanitizeText(payload.notes || '', 800)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('expenses').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/expenses`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function updateExpense(uid, eventId, expenseId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(expenseId);
  if (!safeId) {
    const err = new Error('Invalid expense identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('expenses').doc(safeId);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.ownerId !== uid) {
      const err = new Error('Expense item not found.');
      err.statusCode = 404;
      throw err;
    }

    const updates = {
      title: sanitizeText(payload.title ?? existing.data().title, 180) || existing.data().title,
      category: sanitizeText(payload.category ?? existing.data().category, 64) || existing.data().category,
      vendorId: sanitizeText(payload.vendorId ?? existing.data().vendorId ?? '', 128),
      vendorName: sanitizeText(payload.vendorName ?? existing.data().vendorName ?? '', 160),
      estimatedCost: sanitizePositiveNumber(payload.estimatedCost ?? existing.data().estimatedCost, 0),
      actualCost: sanitizePositiveNumber(payload.actualCost ?? existing.data().actualCost, 0),
      paymentStatus: sanitizeEnum(payload.paymentStatus ?? existing.data().paymentStatus, EXPENSE_PAYMENT_STATUSES, 'unpaid'),
      expenseDate: sanitizeIsoDate(payload.expenseDate ?? existing.data().expenseDate ?? ''),
      notes: sanitizeText(payload.notes ?? existing.data().notes ?? '', 800),
      updatedAt: FieldValue.serverTimestamp()
    };

    await docRef.update(updates);
    return formatDoc(await docRef.get());
  }

  const docPath = `users/${uid}/events/${safeEventId}/expenses/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Expense item not found.');
    err.statusCode = 404;
    throw err;
  }

  const updates = {
    title: sanitizeText(payload.title ?? existing.title, 180) || existing.title,
    category: sanitizeText(payload.category ?? existing.category, 64) || existing.category,
    vendorId: sanitizeText(payload.vendorId ?? existing.vendorId ?? '', 128),
    vendorName: sanitizeText(payload.vendorName ?? existing.vendorName ?? '', 160),
    estimatedCost: sanitizePositiveNumber(payload.estimatedCost ?? existing.estimatedCost, 0),
    actualCost: sanitizePositiveNumber(payload.actualCost ?? existing.actualCost, 0),
    paymentStatus: sanitizeEnum(payload.paymentStatus ?? existing.paymentStatus, EXPENSE_PAYMENT_STATUSES, 'unpaid'),
    expenseDate: sanitizeIsoDate(payload.expenseDate ?? existing.expenseDate ?? ''),
    notes: sanitizeText(payload.notes ?? existing.notes ?? '', 800)
  };
  return updateDocRest(docPath, updates, ['updatedAt'], token);
}

export async function deleteExpense(uid, eventId, expenseId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(expenseId);
  if (!safeId) {
    const err = new Error('Invalid expense identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('expenses').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Expense item not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/expenses/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Expense item not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Tasks Operations (users/{uid}/events/{eventId}/tasks/{taskId})
// ---------------------------------------------------------------------------

export async function listTasks(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('tasks').where('ownerId', '==', uid).get();
    return snap.docs
      .map(formatDoc)
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  }
  const rows = await listCollectionRest(`users/${uid}/events/${safeEventId}`, 'tasks', uid, token);
  return rows.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
}

export async function createTask(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const title = sanitizeText(payload.title || '', 200);
  if (!title) {
    const err = new Error('Task title is required.');
    err.statusCode = 400;
    throw err;
  }
  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    title,
    description: sanitizeText(payload.description || '', 1000),
    priority: sanitizeEnum(payload.priority || 'medium', TASK_PRIORITIES, 'medium'),
    dueDate: sanitizeIsoDate(payload.dueDate || ''),
    category: sanitizeText(payload.category || 'General', 64) || 'General',
    status: sanitizeEnum(payload.status || 'pending', TASK_STATUSES, 'pending'),
    aiGenerated: Boolean(payload.aiGenerated)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('tasks').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/tasks`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function createTasksBulk(uid, eventId, tasksList = [], explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (!Array.isArray(tasksList) || tasksList.length === 0) return [];

  if (hasAdminCredentials()) {
    const batch = adminDb.batch();
    const createdRefs = [];

    for (const raw of tasksList.slice(0, 20)) {
      const title = sanitizeText(raw?.title || '', 200);
      if (!title) continue;
      const docRef = ref.collection('tasks').doc();
      createdRefs.push(docRef);
      batch.set(docRef, {
        ownerId: uid,
        eventId: safeEventId,
        title,
        description: sanitizeText(raw?.description || '', 1000),
        priority: sanitizeEnum(raw?.priority || 'medium', TASK_PRIORITIES, 'medium'),
        dueDate: sanitizeIsoDate(raw?.dueDate || ''),
        category: sanitizeText(raw?.category || 'General', 64) || 'General',
        status: 'pending',
        aiGenerated: Boolean(raw?.aiGenerated ?? true),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    const snaps = await Promise.all(createdRefs.map((r) => r.get()));
    return snaps.map(formatDoc);
  }

  const writes = [];
  const docIds = [];
  for (const raw of tasksList.slice(0, 20)) {
    const title = sanitizeText(raw?.title || '', 200);
    if (!title) continue;
    const id = generateFirestoreDocId();
    docIds.push(id);
    writes.push(
      buildCreateWrite(
        `users/${uid}/events/${safeEventId}/tasks/${id}`,
        {
          ownerId: uid,
          eventId: safeEventId,
          title,
          description: sanitizeText(raw?.description || '', 1000),
          priority: sanitizeEnum(raw?.priority || 'medium', TASK_PRIORITIES, 'medium'),
          dueDate: sanitizeIsoDate(raw?.dueDate || ''),
          category: sanitizeText(raw?.category || 'General', 64) || 'General',
          status: 'pending',
          aiGenerated: Boolean(raw?.aiGenerated ?? true)
        },
        ['createdAt', 'updatedAt']
      )
    );
  }
  await commitWritesRest(writes, token);
  const all = await listTasks(uid, safeEventId, token);
  return all.filter((t) => docIds.includes(t.id));
}

export async function updateTask(uid, eventId, taskId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(taskId);
  if (!safeId) {
    const err = new Error('Invalid task identifier.');
    err.statusCode = 400;
    throw err;
  }

  const updates = {};
  if (typeof payload.title === 'string' && payload.title.trim()) {
    updates.title = sanitizeText(payload.title, 200);
  }
  if (typeof payload.description === 'string') {
    updates.description = sanitizeText(payload.description, 1000);
  }
  if (typeof payload.category === 'string' && payload.category.trim()) {
    updates.category = sanitizeText(payload.category, 64);
  }
  if (typeof payload.priority === 'string') {
    updates.priority = sanitizeEnum(payload.priority, TASK_PRIORITIES, 'medium');
  }
  if (typeof payload.dueDate === 'string') {
    updates.dueDate = sanitizeIsoDate(payload.dueDate);
  }
  if (typeof payload.status === 'string') {
    updates.status = sanitizeEnum(payload.status, TASK_STATUSES, 'pending');
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('tasks').doc(safeId);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.ownerId !== uid) {
      const err = new Error('Task not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    return formatDoc(await docRef.get());
  }

  const docPath = `users/${uid}/events/${safeEventId}/tasks/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Task not found.');
    err.statusCode = 404;
    throw err;
  }
  return updateDocRest(docPath, updates, ['updatedAt'], token);
}

export async function deleteTask(uid, eventId, taskId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(taskId);
  if (!safeId) {
    const err = new Error('Invalid task identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('tasks').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Task not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/tasks/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Task not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Guests Operations (users/{uid}/events/{eventId}/guests/{guestId})
// ---------------------------------------------------------------------------

export async function listGuests(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('guests').where('ownerId', '==', uid).get();
    return snap.docs.map(formatDoc);
  }
  return listCollectionRest(`users/${uid}/events/${safeEventId}`, 'guests', uid, token);
}

export async function createGuest(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const name = sanitizeText(payload.name || '', 160);
  if (!name) {
    const err = new Error('Guest name is required.');
    err.statusCode = 400;
    throw err;
  }
  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    name,
    email: sanitizeText(payload.email || '', 180),
    phone: sanitizeText(payload.phone || '', 40),
    group: sanitizeEnum(payload.group || 'Friends', GUEST_GROUPS, 'Friends'),
    rsvpStatus: sanitizeEnum(payload.rsvpStatus || 'pending', GUEST_RSVP_STATUSES, 'pending'),
    invitationStatus: sanitizeEnum(payload.invitationStatus || 'not_sent', GUEST_INVITATION_STATUSES, 'not_sent'),
    attendanceStatus: sanitizeEnum(payload.attendanceStatus || 'not_checked_in', GUEST_ATTENDANCE_STATUSES, 'not_checked_in'),
    dietaryNotes: sanitizeText(payload.dietaryNotes || '', 300),
    notes: sanitizeText(payload.notes || '', 600)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('guests').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/guests`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function updateGuest(uid, eventId, guestId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(guestId);
  if (!safeId) {
    const err = new Error('Invalid guest identifier.');
    err.statusCode = 400;
    throw err;
  }

  const updates = {};
  if (typeof payload.name === 'string' && payload.name.trim()) {
    updates.name = sanitizeText(payload.name, 160);
  }
  if (typeof payload.email === 'string') {
    updates.email = sanitizeText(payload.email, 180);
  }
  if (typeof payload.phone === 'string') {
    updates.phone = sanitizeText(payload.phone, 40);
  }
  if (typeof payload.group === 'string') {
    updates.group = sanitizeEnum(payload.group, GUEST_GROUPS, 'Friends');
  }
  if (typeof payload.rsvpStatus === 'string') {
    updates.rsvpStatus = sanitizeEnum(payload.rsvpStatus, GUEST_RSVP_STATUSES, 'pending');
  }
  if (typeof payload.invitationStatus === 'string') {
    updates.invitationStatus = sanitizeEnum(payload.invitationStatus, GUEST_INVITATION_STATUSES, 'not_sent');
  }
  if (typeof payload.attendanceStatus === 'string') {
    updates.attendanceStatus = sanitizeEnum(payload.attendanceStatus, GUEST_ATTENDANCE_STATUSES, 'not_checked_in');
  }
  if (typeof payload.dietaryNotes === 'string') {
    updates.dietaryNotes = sanitizeText(payload.dietaryNotes, 300);
  }
  if (typeof payload.notes === 'string') {
    updates.notes = sanitizeText(payload.notes, 600);
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('guests').doc(safeId);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.ownerId !== uid) {
      const err = new Error('Guest not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    return formatDoc(await docRef.get());
  }

  const docPath = `users/${uid}/events/${safeEventId}/guests/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Guest not found.');
    err.statusCode = 404;
    throw err;
  }
  return updateDocRest(docPath, updates, ['updatedAt'], token);
}

export async function deleteGuest(uid, eventId, guestId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(guestId);
  if (!safeId) {
    const err = new Error('Invalid guest identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('guests').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Guest not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/guests/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Guest not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Vendors Operations (users/{uid}/events/{eventId}/vendors/{vendorId})
// ---------------------------------------------------------------------------

export async function listVendors(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('vendors').where('ownerId', '==', uid).get();
    return snap.docs.map(formatDoc);
  }
  return listCollectionRest(`users/${uid}/events/${safeEventId}`, 'vendors', uid, token);
}

export async function createVendor(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const name = sanitizeText(payload.name || '', 160);
  if (!name) {
    const err = new Error('Vendor name is required.');
    err.statusCode = 400;
    throw err;
  }
  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    name,
    category: sanitizeText(payload.category || 'Venue', 64) || 'Venue',
    status: sanitizeEnum(payload.status || 'shortlisted', VENDOR_STATUSES, 'shortlisted'),
    contactInfo: sanitizeText(payload.contactInfo || '', 300),
    estimatedCost: sanitizePositiveNumber(payload.estimatedCost, 0),
    actualCost: sanitizePositiveNumber(payload.actualCost, 0),
    paymentStatus: sanitizeEnum(payload.paymentStatus || 'unpaid', VENDOR_PAYMENT_STATUSES, 'unpaid'),
    bookingDate: sanitizeIsoDate(payload.bookingDate || ''),
    notes: sanitizeText(payload.notes || '', 800)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('vendors').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/vendors`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function updateVendor(uid, eventId, vendorId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(vendorId);
  if (!safeId) {
    const err = new Error('Invalid vendor identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('vendors').doc(safeId);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.ownerId !== uid) {
      const err = new Error('Vendor not found.');
      err.statusCode = 404;
      throw err;
    }

    const updates = {
      name: sanitizeText(payload.name ?? existing.data().name, 160) || existing.data().name,
      category: sanitizeText(payload.category ?? existing.data().category, 64) || existing.data().category,
      status: sanitizeEnum(payload.status ?? existing.data().status, VENDOR_STATUSES, 'shortlisted'),
      contactInfo: sanitizeText(payload.contactInfo ?? existing.data().contactInfo ?? '', 300),
      estimatedCost: sanitizePositiveNumber(payload.estimatedCost ?? existing.data().estimatedCost, 0),
      actualCost: sanitizePositiveNumber(payload.actualCost ?? existing.data().actualCost, 0),
      paymentStatus: sanitizeEnum(payload.paymentStatus ?? existing.data().paymentStatus, VENDOR_PAYMENT_STATUSES, 'unpaid'),
      bookingDate: sanitizeIsoDate(payload.bookingDate ?? existing.data().bookingDate ?? ''),
      notes: sanitizeText(payload.notes ?? existing.data().notes ?? '', 800),
      updatedAt: FieldValue.serverTimestamp()
    };

    await docRef.update(updates);
    return formatDoc(await docRef.get());
  }

  const docPath = `users/${uid}/events/${safeEventId}/vendors/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Vendor not found.');
    err.statusCode = 404;
    throw err;
  }

  const updates = {
    name: sanitizeText(payload.name ?? existing.name, 160) || existing.name,
    category: sanitizeText(payload.category ?? existing.category, 64) || existing.category,
    status: sanitizeEnum(payload.status ?? existing.status, VENDOR_STATUSES, 'shortlisted'),
    contactInfo: sanitizeText(payload.contactInfo ?? existing.contactInfo ?? '', 300),
    estimatedCost: sanitizePositiveNumber(payload.estimatedCost ?? existing.estimatedCost, 0),
    actualCost: sanitizePositiveNumber(payload.actualCost ?? existing.actualCost, 0),
    paymentStatus: sanitizeEnum(payload.paymentStatus ?? existing.paymentStatus, VENDOR_PAYMENT_STATUSES, 'unpaid'),
    bookingDate: sanitizeIsoDate(payload.bookingDate ?? existing.bookingDate ?? ''),
    notes: sanitizeText(payload.notes ?? existing.notes ?? '', 800)
  };
  return updateDocRest(docPath, updates, ['updatedAt'], token);
}

export async function deleteVendor(uid, eventId, vendorId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(vendorId);
  if (!safeId) {
    const err = new Error('Invalid vendor identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('vendors').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Vendor not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/vendors/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Vendor not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Timeline Operations (users/{uid}/events/{eventId}/timeline/{timelineId})
// ---------------------------------------------------------------------------

export async function listTimeline(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('timeline').where('ownerId', '==', uid).get();
    return snap.docs
      .map(formatDoc)
      .sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));
  }
  const rows = await listCollectionRest(`users/${uid}/events/${safeEventId}`, 'timeline', uid, token);
  return rows.sort((a, b) => (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0));
}

export async function createTimelineItem(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const timeSlot = sanitizeText(payload.timeSlot || '', 32);
  const title = sanitizeText(payload.title || '', 200);
  if (!timeSlot || !title) {
    const err = new Error('Timeline start time and activity title are required.');
    err.statusCode = 400;
    throw err;
  }

  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    timeSlot,
    endTime: sanitizeText(payload.endTime || '', 32),
    title,
    description: sanitizeText(payload.description || '', 800),
    orderIndex: clampInt(payload.orderIndex, 0, 1000, 0),
    completed: Boolean(payload.completed)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('timeline').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/timeline`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function createTimelineBulk(uid, eventId, itemsList = [], baseIndex = 0, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (!Array.isArray(itemsList) || itemsList.length === 0) return [];

  if (hasAdminCredentials()) {
    const batch = adminDb.batch();
    const createdRefs = [];

    itemsList.slice(0, 25).forEach((raw, idx) => {
      const timeSlot = sanitizeText(raw?.timeSlot || '', 32);
      const title = sanitizeText(raw?.title || '', 200);
      if (!timeSlot || !title) return;
      const docRef = ref.collection('timeline').doc();
      createdRefs.push(docRef);
      batch.set(docRef, {
        ownerId: uid,
        eventId: safeEventId,
        timeSlot,
        endTime: sanitizeText(raw?.endTime || '', 32),
        title,
        description: sanitizeText(raw?.description || '', 800),
        orderIndex: clampInt(baseIndex + idx, 0, 1000, idx),
        completed: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    const snaps = await Promise.all(createdRefs.map((r) => r.get()));
    return snaps.map(formatDoc);
  }

  const writes = [];
  const docIds = [];
  itemsList.slice(0, 25).forEach((raw, idx) => {
    const timeSlot = sanitizeText(raw?.timeSlot || '', 32);
    const title = sanitizeText(raw?.title || '', 200);
    if (!timeSlot || !title) return;
    const id = generateFirestoreDocId();
    docIds.push(id);
    writes.push(
      buildCreateWrite(
        `users/${uid}/events/${safeEventId}/timeline/${id}`,
        {
          ownerId: uid,
          eventId: safeEventId,
          timeSlot,
          endTime: sanitizeText(raw?.endTime || '', 32),
          title,
          description: sanitizeText(raw?.description || '', 800),
          orderIndex: clampInt(baseIndex + idx, 0, 1000, idx),
          completed: false
        },
        ['createdAt', 'updatedAt']
      )
    );
  });

  await commitWritesRest(writes, token);
  const all = await listTimeline(uid, safeEventId, token);
  return all.filter((item) => docIds.includes(item.id));
}

export async function updateTimelineItem(uid, eventId, timelineId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(timelineId);
  if (!safeId) {
    const err = new Error('Invalid timeline item identifier.');
    err.statusCode = 400;
    throw err;
  }

  const updates = {};
  if (typeof payload.timeSlot === 'string' && payload.timeSlot.trim()) {
    updates.timeSlot = sanitizeText(payload.timeSlot, 32);
  }
  if (typeof payload.endTime === 'string') {
    updates.endTime = sanitizeText(payload.endTime, 32);
  }
  if (typeof payload.title === 'string' && payload.title.trim()) {
    updates.title = sanitizeText(payload.title, 200);
  }
  if (typeof payload.description === 'string') {
    updates.description = sanitizeText(payload.description, 800);
  }
  if (typeof payload.completed === 'boolean') {
    updates.completed = payload.completed;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('timeline').doc(safeId);
    const existing = await docRef.get();
    if (!existing.exists || existing.data()?.ownerId !== uid) {
      const err = new Error('Timeline activity not found.');
      err.statusCode = 404;
      throw err;
    }
    if (payload.orderIndex !== undefined) {
      updates.orderIndex = clampInt(payload.orderIndex, 0, 1000, existing.data().orderIndex || 0);
    }
    await docRef.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    return formatDoc(await docRef.get());
  }

  const docPath = `users/${uid}/events/${safeEventId}/timeline/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Timeline activity not found.');
    err.statusCode = 404;
    throw err;
  }
  if (payload.orderIndex !== undefined) {
    updates.orderIndex = clampInt(payload.orderIndex, 0, 1000, existing.orderIndex || 0);
  }
  return updateDocRest(docPath, updates, ['updatedAt'], token);
}

export async function reorderTimelineItems(uid, eventId, pairs = [], explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (!Array.isArray(pairs) || pairs.length === 0) return [];

  if (hasAdminCredentials()) {
    const snap = await ref.collection('timeline').where('ownerId', '==', uid).get();
    const ownedRefs = new Map(snap.docs.map((d) => [d.id, d.ref]));
    const batch = adminDb.batch();
    let writeCount = 0;

    for (const item of pairs.slice(0, 100)) {
      const safeId = sanitizeId(item?.id);
      const docRef = safeId ? ownedRefs.get(safeId) : null;
      if (!docRef) continue;
      batch.update(docRef, {
        orderIndex: clampInt(item.orderIndex, 0, 1000, 0),
        updatedAt: FieldValue.serverTimestamp()
      });
      writeCount += 1;
    }

    if (writeCount > 0) {
      await batch.commit();
    }
    return listTimeline(uid, safeEventId);
  }

  const existingList = await listTimeline(uid, safeEventId, token);
  const ownedIds = new Set(existingList.map((i) => i.id));
  const writes = [];
  for (const item of pairs.slice(0, 100)) {
    const safeId = sanitizeId(item?.id);
    if (!safeId || !ownedIds.has(safeId)) continue;
    writes.push(
      buildUpdateWrite(
        `users/${uid}/events/${safeEventId}/timeline/${safeId}`,
        { orderIndex: clampInt(item.orderIndex, 0, 1000, 0) },
        ['updatedAt']
      )
    );
  }
  await commitWritesRest(writes, token);
  return listTimeline(uid, safeEventId, token);
}

export async function deleteTimelineItem(uid, eventId, timelineId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(timelineId);
  if (!safeId) {
    const err = new Error('Invalid timeline item identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('timeline').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Timeline activity not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/timeline/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Timeline activity not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Themes Operations (users/{uid}/events/{eventId}/themes/{themeId})
// ---------------------------------------------------------------------------

export async function listThemes(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  if (hasAdminCredentials()) {
    const snap = await ref.collection('themes').where('ownerId', '==', uid).get();
    return snap.docs.map(formatDoc);
  }
  return listCollectionRest(`users/${uid}/events/${safeEventId}`, 'themes', uid, token);
}

export async function createTheme(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const rawPalette = Array.isArray(payload.palette) ? payload.palette : [];
  const safePalette = rawPalette
    .map((c) => sanitizeHexColor(c, ''))
    .filter(Boolean)
    .slice(0, 8);
  if (safePalette.length === 0) {
    safePalette.push('#14251C', '#A3B59A', '#F5F3ED');
  }

  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    name: sanitizeText(payload.name || 'Custom Event Theme', 160) || 'Custom Event Theme',
    description: sanitizeText(payload.description || 'Custom event theme concept.', 1500) || 'Custom event theme concept.',
    palette: safePalette,
    decoration: sanitizeText(payload.decoration || '', 1000),
    lighting: sanitizeText(payload.lighting || '', 800),
    floral: sanitizeText(payload.floral || '', 800),
    tableStyling: sanitizeText(payload.tableStyling || '', 800),
    venueStyling: sanitizeText(payload.venueStyling || '', 800),
    dressCode: sanitizeText(payload.dressCode || '', 500),
    invitationConcept: sanitizeText(payload.invitationConcept || '', 800),
    materials: sanitizeText(payload.materials || '', 800),
    budgetAlternatives: sanitizeText(payload.budgetAlternatives || '', 1000),
    moodboardSpecs: sanitizeMoodboardSpecs(payload.moodboardSpecs)
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('themes').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/themes`, generateFirestoreDocId(), docData, ['createdAt', 'updatedAt'], token);
}

export async function deleteTheme(uid, eventId, themeId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const safeId = sanitizeId(themeId);
  if (!safeId) {
    const err = new Error('Invalid theme identifier.');
    err.statusCode = 400;
    throw err;
  }

  if (hasAdminCredentials()) {
    const docRef = ref.collection('themes').doc(safeId);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      const err = new Error('Saved theme not found.');
      err.statusCode = 404;
      throw err;
    }
    await docRef.delete();
    return { deleted: true, id: safeId };
  }

  const docPath = `users/${uid}/events/${safeEventId}/themes/${safeId}`;
  const existing = await getDocRest(docPath, token);
  if (!existing || existing.ownerId !== uid) {
    const err = new Error('Saved theme not found.');
    err.statusCode = 404;
    throw err;
  }
  await deleteDocRest(docPath, token);
  return { deleted: true, id: safeId };
}

// ---------------------------------------------------------------------------
// Chats Operations (users/{uid}/events/{eventId}/chats/{chatId})
// ---------------------------------------------------------------------------

export async function listChats(uid, eventId, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  let rows;
  if (hasAdminCredentials()) {
    const snap = await ref.collection('chats').where('ownerId', '==', uid).get();
    rows = snap.docs.map(formatDoc);
  } else {
    rows = await listCollectionRest(`users/${uid}/events/${safeEventId}`, 'chats', uid, token);
  }
  return rows.sort((a, b) => {
    const sa = a.createdAt?.seconds ?? 0;
    const sb = b.createdAt?.seconds ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.createdAt?.nanoseconds ?? 0) - (b.createdAt?.nanoseconds ?? 0);
  });
}

export async function createChatTurn(uid, eventId, payload = {}, explicitToken = '') {
  const { ref, safeEventId, token } = await assertEventOwnership(uid, eventId, explicitToken);
  const content = sanitizeText(payload.content || '', 12000);
  const conversationId = sanitizeId(payload.conversationId || '');
  if (!content || !conversationId) {
    const err = new Error('Chat content and valid conversationId are required.');
    err.statusCode = 400;
    throw err;
  }

  const docData = {
    ownerId: uid,
    eventId: safeEventId,
    role: payload.role === 'assistant' ? 'assistant' : 'user',
    content,
    conversationId
  };

  if (hasAdminCredentials()) {
    const docRef = await ref.collection('chats').add({
      ...docData,
      createdAt: FieldValue.serverTimestamp()
    });
    return formatDoc(await docRef.get());
  }

  return createDocRest(`users/${uid}/events/${safeEventId}/chats`, generateFirestoreDocId(), docData, ['createdAt'], token);
}

// ---------------------------------------------------------------------------
// Workspace Aggregations & Export
// ---------------------------------------------------------------------------

export async function getEventWorkspaceSnapshot(uid, eventId, explicitToken = '') {
  const event = await getEvent(uid, eventId, explicitToken);
  const [tasks, expenses, guests, vendors, timeline, themes] = await Promise.all([
    listTasks(uid, eventId, explicitToken),
    listExpenses(uid, eventId, explicitToken),
    listGuests(uid, eventId, explicitToken),
    listVendors(uid, eventId, explicitToken),
    listTimeline(uid, eventId, explicitToken),
    listThemes(uid, eventId, explicitToken)
  ]);

  return { event, tasks, expenses, guests, vendors, timeline, themes };
}

export async function buildEventContext(uid, eventId, explicitToken = '') {
  const { event, tasks, expenses, guests, vendors, timeline, themes } = await getEventWorkspaceSnapshot(
    uid,
    eventId,
    explicitToken
  );
  const activeTheme = themes[0] || null;

  const totalBudget = Number(event.budget) || 0;
  const totalEstimated = expenses.reduce((s, e) => s + (Number(e.estimatedCost) || 0), 0);
  const totalActual = expenses.reduce((s, e) => s + (Number(e.actualCost) || 0), 0);

  return {
    event: {
      name: event.name,
      type: event.type,
      date: event.date,
      location: event.location,
      guestCount: event.guestCount,
      budget: event.budget,
      currency: event.currency,
      style: event.style,
      preferences: event.preferences || '',
      specialRequirements: event.specialRequirements || ''
    },
    budgetSummary: {
      totalBudget,
      totalEstimated,
      totalActual,
      remaining: totalBudget - totalActual
    },
    taskSummary: {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      highPriorityTitles: tasks
        .filter((t) => t.status !== 'completed' && t.priority === 'high')
        .slice(0, 6)
        .map((t) => t.title)
    },
    guestSummary: {
      total: guests.length,
      confirmed: guests.filter((g) => g.rsvpStatus === 'confirmed').length,
      pending: guests.filter((g) => g.rsvpStatus === 'pending').length,
      declined: guests.filter((g) => g.rsvpStatus === 'declined').length
    },
    vendors: vendors.map((v) => ({ name: v.name, category: v.category, status: v.status })),
    timeline: timeline.map((t) => ({ timeSlot: t.timeSlot, title: t.title })),
    activeTheme: activeTheme ? { name: activeTheme.name, description: activeTheme.description } : null
  };
}

export async function exportAllUserData(uid, explicitToken = '') {
  const profile = hasAdminCredentials()
    ? await (async () => {
        const snap = await userDocRef(uid).get();
        return snap.exists ? serializeFirestoreValue(snap.data()) : null;
      })()
    : await getDocRest(`users/${uid}`, resolveRestToken(explicitToken));

  const events = await listEvents(uid, explicitToken);
  const detailedEvents = await Promise.all(
    events.map(async (ev) => {
      const snapshot = await getEventWorkspaceSnapshot(uid, ev.id, explicitToken);
      const chats = await listChats(uid, ev.id, explicitToken);
      return { ...snapshot, chats };
    })
  );

  return {
    exportedAt: new Date().toISOString(),
    projectId: 'avenora-ai',
    user: {
      uid,
      email: profile?.email || '',
      displayName: profile?.displayName || ''
    },
    events: detailedEvents
  };
}
