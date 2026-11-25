import {
  analyzeBudget,
  chatWithCopilot,
  generateEventBlueprint,
  generateInvitation,
  generateSmartTasks,
  generateThemeStudio,
  generateTimeline,
  generateVendorInquiry
} from '../services/geminiService.js';
import { buildEventContext } from '../services/firebaseService.js';
import {
  clampInt,
  sanitizeId,
  sanitizeIsoDate,
  sanitizePositiveNumber,
  sanitizeText
} from '../utils/sanitize.js';

function sanitizeEventPayload(raw = {}) {
  return {
    name: sanitizeText(raw.name || 'Untitled Event', 160),
    type: sanitizeText(raw.type || 'Custom', 64),
    date: sanitizeIsoDate(raw.date || '', 32) || sanitizeText(raw.date || '', 32),
    location: sanitizeText(raw.location || '', 200),
    guestCount: Math.max(1, Math.min(100000, Math.round(sanitizePositiveNumber(raw.guestCount, 50, 100000)))),
    budget: sanitizePositiveNumber(raw.budget, 0, 1000000000),
    currency: sanitizeText(raw.currency || 'USD', 8),
    style: sanitizeText(raw.style || 'Modern', 64),
    preferences: sanitizeText(raw.preferences || '', 1500),
    specialRequirements: sanitizeText(raw.specialRequirements || '', 1500)
  };
}

function sanitizeCopilotContext(rawCtx = {}) {
  return {
    event: sanitizeEventPayload(rawCtx.event || {}),
    budgetSummary: {
      totalBudget: sanitizePositiveNumber(rawCtx.budgetSummary?.totalBudget, 0),
      totalEstimated: sanitizePositiveNumber(rawCtx.budgetSummary?.totalEstimated, 0),
      totalActual: sanitizePositiveNumber(rawCtx.budgetSummary?.totalActual, 0),
      remaining: Number.isFinite(Number(rawCtx.budgetSummary?.remaining))
        ? Number(rawCtx.budgetSummary.remaining)
        : 0
    },
    taskSummary: {
      total: clampInt(rawCtx.taskSummary?.total, 0, 5000, 0),
      completed: clampInt(rawCtx.taskSummary?.completed, 0, 5000, 0),
      highPriorityTitles: Array.isArray(rawCtx.taskSummary?.highPriorityTitles)
        ? rawCtx.taskSummary.highPriorityTitles.slice(0, 10).map((t) => sanitizeText(t, 120)).filter(Boolean)
        : []
    },
    guestSummary: {
      total: clampInt(rawCtx.guestSummary?.total, 0, 100000, 0),
      confirmed: clampInt(rawCtx.guestSummary?.confirmed, 0, 100000, 0),
      pending: clampInt(rawCtx.guestSummary?.pending, 0, 100000, 0),
      declined: clampInt(rawCtx.guestSummary?.declined, 0, 100000, 0)
    },
    vendors: Array.isArray(rawCtx.vendors)
      ? rawCtx.vendors.slice(0, 15).map((v) => ({
          name: sanitizeText(v?.name || '', 120),
          category: sanitizeText(v?.category || '', 64),
          status: sanitizeText(v?.status || '', 32)
        }))
      : [],
    timeline: Array.isArray(rawCtx.timeline)
      ? rawCtx.timeline.slice(0, 15).map((t) => ({
          timeSlot: sanitizeText(t?.timeSlot || '', 32),
          title: sanitizeText(t?.title || '', 160)
        }))
      : [],
    activeTheme:
      rawCtx.activeTheme && typeof rawCtx.activeTheme === 'object'
        ? {
            name: sanitizeText(rawCtx.activeTheme.name || '', 140),
            description: sanitizeText(rawCtx.activeTheme.description || '', 500)
          }
        : null
  };
}

export async function createEventPlanHandler(req, res, next) {
  try {
    const rawEvent = req.body?.event || req.body || {};
    const validDate = sanitizeIsoDate(rawEvent.date || '');
    const event = sanitizeEventPayload(rawEvent);
    if (!event.name || !validDate || !event.location) {
      return res.status(400).json({ error: 'Event name, valid YYYY-MM-DD date, and location are required.' });
    }
    event.date = validDate;
    const sectionKey = req.body?.sectionKey ? sanitizeText(req.body.sectionKey, 64) : null;
    const blueprint = await generateEventBlueprint(event, sectionKey);
    return res.json({ blueprint, sectionKey });
  } catch (err) {
    return next(err);
  }
}

export async function chatHandler(req, res, next) {
  try {
    const message = sanitizeText(req.body?.message, 4000);
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    let eventContext;
    const eventId = sanitizeId(req.body?.eventId || '');
    if (eventId) {
      eventContext = await buildEventContext(req.user.uid, eventId);
    } else {
      eventContext = sanitizeCopilotContext(req.body?.context || {});
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-12).map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: sanitizeText(h.content, 4000)
        }))
      : [];

    const result = await chatWithCopilot(eventContext, history, message);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function budgetAdvisorHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const budgetData = {
      totalBudget: sanitizePositiveNumber(req.body?.budgetData?.totalBudget, event.budget),
      totalEstimated: sanitizePositiveNumber(req.body?.budgetData?.totalEstimated, 0),
      totalActual: sanitizePositiveNumber(req.body?.budgetData?.totalActual, 0),
      remaining: Number(req.body?.budgetData?.remaining) || 0,
      percentSpent: Number(req.body?.budgetData?.percentSpent) || 0,
      categoryBreakdown: Array.isArray(req.body?.budgetData?.categoryBreakdown)
        ? req.body.budgetData.categoryBreakdown.slice(0, 20)
        : []
    };
    const advice = await analyzeBudget(event, budgetData);
    return res.json({ advice });
  } catch (err) {
    return next(err);
  }
}

export async function generateTasksHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const existingTitles = Array.isArray(req.body?.existingTitles)
      ? req.body.existingTitles.map((t) => sanitizeText(t, 200)).filter(Boolean)
      : [];
    const data = await generateSmartTasks(event, existingTitles);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

export async function generateThemeHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const direction = sanitizeText(req.body?.direction || '', 500);
    const theme = await generateThemeStudio(event, direction);
    return res.json({ theme });
  } catch (err) {
    return next(err);
  }
}

export async function generateInvitationHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const options = {
      tone: sanitizeText(req.body?.tone || 'Formal', 80),
      guestName: sanitizeText(req.body?.guestName || '', 120),
      customNotes: sanitizeText(req.body?.customNotes || '', 600)
    };
    const invitations = await generateInvitation(event, options);
    return res.json({ invitations });
  } catch (err) {
    return next(err);
  }
}

export async function generateVendorEmailHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const options = {
      vendorCategory: sanitizeText(req.body?.vendorCategory || 'Venue', 64),
      requirements: sanitizeText(req.body?.requirements || '', 800)
    };
    const messages = await generateVendorInquiry(event, options);
    return res.json({ messages });
  } catch (err) {
    return next(err);
  }
}

export async function generateTimelineHandler(req, res, next) {
  try {
    const event = sanitizeEventPayload(req.body?.event || {});
    const options = {
      startTime: sanitizeText(req.body?.startTime || '16:00', 16),
      duration: sanitizeText(req.body?.duration || '6 hours', 40),
      activities: sanitizeText(req.body?.activities || '', 800)
    };
    const timeline = await generateTimeline(event, options);
    return res.json(timeline);
  } catch (err) {
    return next(err);
  }
}
