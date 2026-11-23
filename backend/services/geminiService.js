import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error('Gemini API key is not configured in backend environment secrets.');
    err.statusCode = 503;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

function extractGeminiErrorInfo(err) {
  const rawMsg = String(err?.message || '');
  let parsed = null;
  if (rawMsg.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(rawMsg);
    } catch {
      parsed = null;
    }
  }

  const nestedErr = parsed?.error || parsed || {};
  const status = Number(nestedErr.code || err?.status || err?.statusCode) || 500;
  const apiStatus = String(nestedErr.status || err?.code || '').toUpperCase();
  const detailMsg = String(nestedErr.message || rawMsg || 'AI generation failed.');
  return { status, apiStatus, detailMsg };
}

function normalizeGeminiError(err) {
  const { status, apiStatus, detailMsg } = extractGeminiErrorInfo(err);

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || detailMsg.toLowerCase().includes('quota')) {
    const retryMatch = detailMsg.match(/retry in\s+([0-9hms.]+)/i);
    const retryHint = retryMatch ? ` Retry window: ${retryMatch[1]}.` : '';
    const friendly = new Error(
      `Gemini API free-tier quota exceeded for your backend GEMINI_API_KEY.${retryHint} Enable billing on your Google AI Studio project or update GEMINI_API_KEY on Render to continue generating.`
    );
    friendly.statusCode = 429;
    friendly.code = 'RESOURCE_EXHAUSTED';
    return friendly;
  }

  if (
    status === 503 ||
    apiStatus === 'UNAVAILABLE' ||
    detailMsg.toLowerCase().includes('high demand') ||
    detailMsg.toLowerCase().includes('overloaded')
  ) {
    const friendly = new Error(
      'AI models are currently experiencing temporary high demand. Please wait a few seconds and try again.'
    );
    friendly.statusCode = 503;
    friendly.code = 'UNAVAILABLE';
    return friendly;
  }

  if (status === 400 || status === 403 || apiStatus === 'PERMISSION_DENIED' || detailMsg.includes('API_KEY_INVALID')) {
    const friendly = new Error(
      'Gemini API key was rejected (invalid or unauthorized). Check GEMINI_API_KEY in your backend environment variables.'
    );
    friendly.statusCode = status === 403 ? 403 : 400;
    friendly.code = apiStatus || 'GEMINI_AUTH_ERROR';
    return friendly;
  }

  const friendly = new Error(detailMsg.length > 260 ? `${detailMsg.slice(0, 257)}...` : detailMsg);
  friendly.statusCode = status >= 400 && status < 600 ? status : 502;
  return friendly;
}

function shouldFallbackModel(err) {
  const { status, apiStatus, detailMsg } = extractGeminiErrorInfo(err);
  const lower = detailMsg.toLowerCase();
  return (
    status === 429 ||
    status === 404 ||
    status >= 500 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    apiStatus === 'UNAVAILABLE' ||
    apiStatus === 'INTERNAL' ||
    lower.includes('quota') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('temporarily unavailable')
  );
}

async function runGeminiCall(ai, paramsBuilder) {
  const tryModel = async (modelName, thinkingLevel, maxRetries = 1) => {
    const params = paramsBuilder(modelName, thinkingLevel);
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await ai.models.generateContent(params);
      } catch (err) {
        lastErr = err;
        const { status, apiStatus, detailMsg } = extractGeminiErrorInfo(err);
        const isTransient =
          status >= 500 ||
          apiStatus === 'UNAVAILABLE' ||
          detailMsg.toLowerCase().includes('high demand');
        if (attempt < maxRetries && isTransient) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  };

  try {
    return await tryModel(MODEL_NAME, ThinkingLevel.LOW, 1);
  } catch (primaryErr) {
    if (shouldFallbackModel(primaryErr)) {
      try {
        return await tryModel(FALLBACK_MODEL_NAME, ThinkingLevel.MINIMAL, 2);
      } catch (fallbackErr) {
        throw normalizeGeminiError(fallbackErr);
      }
    }
    throw normalizeGeminiError(primaryErr);
  }
}

function parseJsonSafe(rawText, fallback) {
  if (!rawText) return fallback;
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

function formatEventSummary(event) {
  return [
    `Event Name: ${event.name || 'Untitled Event'}`,
    `Event Type: ${event.type || 'Custom'}`,
    `Event Date: ${event.date || 'TBD'}`,
    `Location: ${event.location || 'TBD'}`,
    `Estimated Guests: ${event.guestCount || 0}`,
    `Total Budget: ${event.budget || 0} ${event.currency || 'USD'}`,
    `Preferred Style/Theme: ${event.style || 'Modern'}`,
    `Preferences: ${event.preferences || 'None specified'}`,
    `Special Requirements: ${event.specialRequirements || 'None specified'}`
  ].join('\n');
}

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING, description: 'Concise executive overview tailored to event, location, guest count, and budget.' },
    concept: { type: Type.STRING, description: 'Distinctive creative event concept and narrative.' },
    themeRecommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 4 tailored theme and aesthetic directions.'
    },
    venueRequirements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Specific venue criteria (capacity, layout, acoustics, accessibility, weather backup).'
    },
    schedule: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          activity: { type: Type.STRING },
          details: { type: Type.STRING }
        },
        required: ['time', 'activity', 'details']
      }
    },
    budgetAllocation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          percentage: { type: Type.NUMBER },
          estimatedAmount: { type: Type.NUMBER },
          rationale: { type: Type.STRING }
        },
        required: ['category', 'percentage', 'estimatedAmount', 'rationale']
      }
    },
    priorityChecklist: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          priority: { type: Type.STRING },
          timeframe: { type: Type.STRING },
          category: { type: Type.STRING }
        },
        required: ['title', 'priority', 'timeframe', 'category']
      }
    },
    decorationIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
    cateringSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    guestExperienceIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
    vendorCategories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          whatToLookFor: { type: Type.STRING },
          leadTime: { type: Type.STRING }
        },
        required: ['category', 'whatToLookFor', 'leadTime']
      }
    },
    planningTimeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phase: { type: Type.STRING },
          milestone: { type: Type.STRING },
          action: { type: Type.STRING }
        },
        required: ['phase', 'milestone', 'action']
      }
    },
    riskManagement: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          risk: { type: Type.STRING },
          mitigation: { type: Type.STRING }
        },
        required: ['risk', 'mitigation']
      }
    },
    contingencySuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    personalizedRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: [
    'overview', 'concept', 'themeRecommendations', 'venueRequirements',
    'schedule', 'budgetAllocation', 'priorityChecklist', 'decorationIdeas',
    'cateringSuggestions', 'guestExperienceIdeas', 'vendorCategories',
    'planningTimeline', 'riskManagement', 'contingencySuggestions',
    'personalizedRecommendations', 'nextSteps'
  ]
};

export const VALID_BLUEPRINT_SECTION_KEYS = Object.keys(BLUEPRINT_SCHEMA.properties);

export async function generateEventBlueprint(event, sectionKey = null) {
  const ai = getGeminiClient();
  const summary = formatEventSummary(event);

  if (sectionKey) {
    if (!VALID_BLUEPRINT_SECTION_KEYS.includes(sectionKey)) {
      const err = new Error(`Unsupported blueprint section key: "${sectionKey}".`);
      err.statusCode = 400;
      throw err;
    }

    const prompt = `You are AVENORA AI, an expert senior event architect.
Regenerate ONLY the "${sectionKey}" section for this event. Keep every point concise, specific, realistic, and aligned with the budget (${event.budget} ${event.currency}) and guest count (${event.guestCount}).
Never invent fake real-world vendor names or phone numbers. Label any cost figures as planning estimates.

Event Details:
${summary}

Return valid JSON matching the requested schema for "${sectionKey}".`;

    const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel },
        systemInstruction: 'Return strictly valid, concise JSON with only the single regenerated section key.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            [sectionKey]: BLUEPRINT_SCHEMA.properties[sectionKey]
          },
          required: [sectionKey]
        }
      }
    }));

    const parsed = parseJsonSafe(response.text, null);
    if (!parsed || !(sectionKey in parsed)) {
      throw new Error('Failed to parse regenerated blueprint section from AI response.');
    }
    return parsed;
  }

  const prompt = `You are AVENORA AI, a world-class event planning architect.
Generate a complete, bespoke, actionable 16-section Event Blueprint tailored to the event details below.
Be crisp and high-impact (avoid filler):
- overview and concept: 2 concise sentences each.
- list arrays (themeRecommendations, venueRequirements, decorationIdeas, cateringSuggestions, guestExperienceIdeas, contingencySuggestions, personalizedRecommendations, nextSteps): 3 specific bullets each.
- schedule: 5–6 timed slots; budgetAllocation: 5–6 categories summing to 100% and ${event.budget}; priorityChecklist: 5–6 tasks; vendorCategories: 4–5 items; planningTimeline: 4 phases; riskManagement: 3–4 items.
Never fabricate real vendor names, phone numbers, or guaranteed real-time quotes; mark monetary allocations clearly as planning estimates.

Event Details:
${summary}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      systemInstruction: 'Produce a crisp, structured, practical 16-section event planning blueprint in JSON matching the exact schema without verbose filler.',
      responseMimeType: 'application/json',
      responseSchema: BLUEPRINT_SCHEMA
    }
  }));

  const blueprint = parseJsonSafe(response.text, null);
  if (!blueprint || !blueprint.overview) {
    throw new Error('Failed to generate a valid structured event blueprint.');
  }

  if (Array.isArray(blueprint.budgetAllocation) && blueprint.budgetAllocation.length > 0 && Number(event.budget) > 0) {
    const totalPct = blueprint.budgetAllocation.reduce((acc, item) => acc + (Number(item.percentage) || 0), 0) || 100;
    blueprint.budgetAllocation = blueprint.budgetAllocation.map((item) => {
      const normalizedPct = Math.round(((Number(item.percentage) || 0) / totalPct) * 1000) / 10;
      const estimatedAmount = Math.round((normalizedPct / 100) * Number(event.budget));
      return {
        category: String(item.category || 'Miscellaneous'),
        percentage: normalizedPct,
        estimatedAmount,
        rationale: String(item.rationale || '')
      };
    });
  }

  return blueprint;
}

export async function chatWithCopilot(eventContext, history, userMessage) {
  const ai = getGeminiClient();

  const contextBlock = `ACTIVE EVENT CONTEXT (Do not ask the user to repeat these stored details):
${formatEventSummary(eventContext.event || {})}

Saved Budget Snapshot:
- Total Budget: ${eventContext.budgetSummary?.totalBudget ?? 0} ${eventContext.event?.currency || 'USD'}
- Total Estimated: ${eventContext.budgetSummary?.totalEstimated ?? 0}
- Total Actual Spent: ${eventContext.budgetSummary?.totalActual ?? 0}
- Remaining Balance: ${eventContext.budgetSummary?.remaining ?? 0}

Checklist Progress:
- Completed Tasks: ${eventContext.taskSummary?.completed ?? 0} of ${eventContext.taskSummary?.total ?? 0}
- Pending High-Priority Tasks: ${(eventContext.taskSummary?.highPriorityTitles || []).join(', ') || 'None'}

Guests Summary:
- Total: ${eventContext.guestSummary?.total ?? 0}, Confirmed: ${eventContext.guestSummary?.confirmed ?? 0}, Pending: ${eventContext.guestSummary?.pending ?? 0}, Declined: ${eventContext.guestSummary?.declined ?? 0}

Vendors Tracked (${eventContext.vendors?.length ?? 0}):
${(eventContext.vendors || []).slice(0, 10).map((v) => `- ${v.category}: ${v.name} (${v.status})`).join('\n') || 'None added yet'}

Timeline Slots (${eventContext.timeline?.length ?? 0}):
${(eventContext.timeline || []).slice(0, 10).map((t) => `- ${t.timeSlot}: ${t.title}`).join('\n') || 'None scheduled yet'}

Active Theme:
${eventContext.activeTheme ? `${eventContext.activeTheme.name} — ${eventContext.activeTheme.description}` : 'Not selected yet'}`;

  const recentTurns = (history || [])
    .slice(-12)
    .map((turn) => `${turn.role === 'assistant' ? 'AVENORA AI' : 'User'}: ${turn.content}`)
    .join('\n\n');

  const prompt = `${contextBlock}

Conversation History:
${recentTurns || 'New conversation'}

User: ${userMessage}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      systemInstruction: 'You are AVENORA AI Co-Pilot, a calm, hyper-organized luxury event strategist. Use the provided event context directly without asking the user to repeat saved details. Give crisp, structured, actionable recommendations tailored to their exact guest count, date, location, budget, and preferences. Never invent fake real-world vendor phone numbers or live prices.'
    }
  }));

  return {
    reply: response.text || 'I could not formulate a response right now. Please try again.'
  };
}

export async function analyzeBudget(event, budgetData) {
  const ai = getGeminiClient();

  const prompt = `Analyze this event's financial state as AVENORA AI Budget Advisor.
Never fabricate real vendor quotes or live market prices; label all financial suggestions as planning estimates.

Event:
${formatEventSummary(event)}

Calculated Financial Totals:
- Total Budget: ${budgetData.totalBudget} ${event.currency}
- Total Estimated Allocations: ${budgetData.totalEstimated} ${event.currency}
- Total Actual Spending: ${budgetData.totalActual} ${event.currency}
- Remaining Balance: ${budgetData.remaining} ${event.currency}
- Percentage Spent: ${budgetData.percentSpent}%

Category Breakdown:
${(budgetData.categoryBreakdown || []).map((c) => `- ${c.category}: Estimated ${c.estimated}, Actual ${c.actual}`).join('\n') || 'No expenses recorded yet.'}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      systemInstruction: 'Provide crisp, structured, realistic budget optimization guidance grounded strictly in the provided figures (3-4 concise points per array).',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          costSavingSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          spendingWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          reallocationSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          alternativeIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
          priorityRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          budgetRiskAnalysis: { type: Type.STRING }
        },
        required: [
          'summary', 'costSavingSuggestions', 'spendingWarnings',
          'reallocationSuggestions', 'alternativeIdeas',
          'priorityRecommendations', 'budgetRiskAnalysis'
        ]
      }
    }
  }));

  return parseJsonSafe(response.text, {
    summary: 'Unable to parse structured advice.',
    costSavingSuggestions: [],
    spendingWarnings: [],
    reallocationSuggestions: [],
    alternativeIdeas: [],
    priorityRecommendations: [],
    budgetRiskAnalysis: ''
  });
}

export async function generateSmartTasks(event, existingTitles = []) {
  const ai = getGeminiClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  const prompt = `Generate 8 to 10 realistic, non-duplicate event planning checklist tasks tailored to this event.
Today's date is ${todayIso}. Event date is ${event.date}.
Every dueDate MUST be a valid YYYY-MM-DD date between ${todayIso} and ${event.date} (or near ${todayIso} if the event date is very soon).
Allowed categories ONLY: Venue, Guest management, Decoration, Catering, Vendors, Budget, Invitations, Logistics, Entertainment, General.
Allowed priority ONLY: high, medium, low.
Avoid duplicating these existing tasks: ${existingTitles.slice(0, 25).join('; ') || 'None'}.

Event:
${formatEventSummary(event)}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                priority: { type: Type.STRING },
                dueDate: { type: Type.STRING },
                category: { type: Type.STRING }
              },
              required: ['title', 'description', 'priority', 'dueDate', 'category']
            }
          }
        },
        required: ['tasks']
      }
    }
  }));

  const parsed = parseJsonSafe(response.text, { tasks: [] });
  const allowedCategories = new Set([
    'Venue', 'Guest management', 'Decoration', 'Catering', 'Vendors',
    'Budget', 'Invitations', 'Logistics', 'Entertainment', 'General'
  ]);
  const allowedPriorities = new Set(['high', 'medium', 'low']);

  return {
    tasks: (parsed.tasks || []).slice(0, 12).map((t) => ({
      title: String(t.title || 'Planning Task').slice(0, 190),
      description: String(t.description || '').slice(0, 950),
      priority: allowedPriorities.has(String(t.priority).toLowerCase()) ? String(t.priority).toLowerCase() : 'medium',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate)) ? String(t.dueDate) : todayIso,
      category: allowedCategories.has(String(t.category)) ? String(t.category) : 'General'
    }))
  };
}

export async function generateThemeStudio(event, direction = '') {
  const ai = getGeminiClient();

  const prompt = `Create a comprehensive, editorial-grade event aesthetic concept for AVENORA AI Theme Studio.
Include exact valid 6-digit HEX color codes in "palette" (5 colors), detailed styling guidance, materials, and budget-friendly alternatives that respect ${event.budget} ${event.currency}.
Also generate 4 structured "moodboardPanels" describing curated visual compositions (e.g., Focal Venue Atmosphere, Tablescape & Florals, Lighting & Ambience, Paper & Material Textures) so the Theme Studio can display art-directed moodboard placeholders clearly.

Event:
${formatEventSummary(event)}
Creative Direction / Request: ${direction || event.style || 'Earthy Luxury Editorial'}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      systemInstruction: 'Keep field descriptions crisp (1–2 impactful sentences per category) so the concept loads rapidly.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          palette: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 5 valid #RRGGBB hex codes.'
          },
          colorRoles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hex: { type: Type.STRING },
                name: { type: Type.STRING },
                usage: { type: Type.STRING }
              },
              required: ['hex', 'name', 'usage']
            }
          },
          decoration: { type: Type.STRING },
          lighting: { type: Type.STRING },
          floral: { type: Type.STRING },
          tableStyling: { type: Type.STRING },
          venueStyling: { type: Type.STRING },
          dressCode: { type: Type.STRING },
          invitationConcept: { type: Type.STRING },
          materials: { type: Type.STRING },
          budgetAlternatives: { type: Type.STRING },
          moodboardPanels: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                zone: { type: Type.STRING },
                visualBrief: { type: Type.STRING },
                keyElements: { type: Type.STRING }
              },
              required: ['zone', 'visualBrief', 'keyElements']
            }
          }
        },
        required: [
          'name', 'description', 'palette', 'colorRoles', 'decoration',
          'lighting', 'floral', 'tableStyling', 'venueStyling', 'dressCode',
          'invitationConcept', 'materials', 'budgetAlternatives', 'moodboardPanels'
        ]
      }
    }
  }));

  const parsed = parseJsonSafe(response.text, null);
  if (!parsed) throw new Error('Failed to generate theme concept.');

  const safePalette = (Array.isArray(parsed.palette) ? parsed.palette : [])
    .filter((c) => /^#[0-9A-Fa-f]{6}$/.test(String(c).trim()))
    .slice(0, 6);
  if (safePalette.length === 0) {
    safePalette.push('#14251C', '#A3B59A', '#F5F3ED', '#8B6548', '#C7A98A');
  }

  return {
    name: String(parsed.name || 'Botanical Sanctuary').slice(0, 150),
    description: String(parsed.description || '').slice(0, 1400),
    palette: safePalette,
    decoration: String(parsed.decoration || '').slice(0, 950),
    lighting: String(parsed.lighting || '').slice(0, 750),
    floral: String(parsed.floral || '').slice(0, 750),
    tableStyling: String(parsed.tableStyling || '').slice(0, 750),
    venueStyling: String(parsed.venueStyling || '').slice(0, 750),
    dressCode: String(parsed.dressCode || '').slice(0, 450),
    invitationConcept: String(parsed.invitationConcept || '').slice(0, 750),
    materials: String(parsed.materials || '').slice(0, 750),
    budgetAlternatives: String(parsed.budgetAlternatives || '').slice(0, 950),
    moodboardSpecs: {
      colorRoles: Array.isArray(parsed.colorRoles) ? parsed.colorRoles.slice(0, 6) : [],
      moodboardPanels: Array.isArray(parsed.moodboardPanels) ? parsed.moodboardPanels.slice(0, 4) : []
    }
  };
}

export async function generateInvitation(event, options = {}) {
  const ai = getGeminiClient();

  const prompt = `Write tailored event invitations in multiple formats for the following event.
Tone / Style Preference: ${options.tone || 'Formal & Warm'}
Guest Name / Segment (optional): ${options.guestName || 'Valued Guest'}
Custom Notes / Dress Code / RSVP Deadline: ${options.customNotes || 'Kindly RSVP at your earliest convenience.'}

Event:
${formatEventSummary(event)}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          whatsapp: { type: Type.STRING },
          emailSubject: { type: Type.STRING },
          emailBody: { type: Type.STRING },
          formal: { type: Type.STRING },
          casual: { type: Type.STRING },
          traditional: { type: Type.STRING },
          modern: { type: Type.STRING },
          custom: { type: Type.STRING }
        },
        required: ['whatsapp', 'emailSubject', 'emailBody', 'formal', 'casual', 'traditional', 'modern', 'custom']
      }
    }
  }));

  return parseJsonSafe(response.text, {});
}

export async function generateVendorInquiry(event, options = {}) {
  const ai = getGeminiClient();

  const prompt = `Draft personalized, realistic vendor outreach messages for a ${options.vendorCategory || 'Venue'} vendor.
Never fabricate vendor contact details, prices, or availability. Use clear bracketed placeholders like [Vendor Name] or [Your Phone].
Specific Requirements: ${options.requirements || event.specialRequirements || 'Standard full-service package inquiry'}

Event:
${formatEventSummary(event)}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emailSubject: { type: Type.STRING },
          emailBody: { type: Type.STRING },
          whatsappMessage: { type: Type.STRING },
          shortInquiry: { type: Type.STRING },
          followUpMessage: { type: Type.STRING }
        },
        required: ['emailSubject', 'emailBody', 'whatsappMessage', 'shortInquiry', 'followUpMessage']
      }
    }
  }));

  return parseJsonSafe(response.text, {});
}

export async function generateTimeline(event, options = {}) {
  const ai = getGeminiClient();

  const prompt = `Create a conflict-free, realistic chronological event-day timeline.
Start Time: ${options.startTime || '16:00'}
Duration / End Window: ${options.duration || '6 hours'}
Key Activities / Notes: ${options.activities || event.preferences || 'Arrival, core ceremony/program, dining, entertainment, wrap-up'}
Use 24-hour HH:MM format for timeSlot and endTime so slots do not overlap.

Event:
${formatEventSummary(event)}`;

  const response = await runGeminiCall(ai, (model, thinkingLevel) => ({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timeSlot: { type: Type.STRING },
                endTime: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ['timeSlot', 'endTime', 'title', 'description']
            }
          }
        },
        required: ['items']
      }
    }
  }));

  const parsed = parseJsonSafe(response.text, { items: [] });
  const normalized = (parsed.items || [])
    .slice(0, 20)
    .map((item, idx) => ({
      timeSlot: String(item.timeSlot || '09:00').slice(0, 16),
      endTime: String(item.endTime || '').slice(0, 16),
      title: String(item.title || `Activity ${idx + 1}`).slice(0, 190),
      description: String(item.description || '').slice(0, 750),
      orderIndex: idx
    }))
    .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot))
    .map((item, idx) => ({ ...item, orderIndex: idx }));

  return { items: normalized };
}
