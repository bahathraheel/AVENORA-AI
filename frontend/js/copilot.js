import { apiRequest, callAiEndpoint } from './api.js';
import {
  copyToClipboard,
  escapeHtml,
  formatCurrency,
  formatDate,
  initProtectedPage,
  renderIcons,
  renderNoEventState,
  showToast
} from './main.js';

const SUGGESTED_PROMPTS = [
  'What should I do next?',
  'How can I reduce my event costs?',
  'What am I forgetting?',
  'How should I distribute my budget?',
  'Suggest a different event theme',
  'Create an invitation for our guests',
  'Suggest food and dietary options for my guests',
  'Improve my event timeline'
];

initProtectedPage({
  activeKey: 'copilot',
  pageTitle: 'AI Event Co-Pilot',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('copilot-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Launch AI Co-Pilot');
      return;
    }

    const chatsApi = `/api/events/${encodeURIComponent(activeEvent.id)}/chats`;
    let allMessages = [];
    let conversationId = `conv_${Date.now()}`;
    let isThinking = false;

    async function loadMessages() {
      const data = await apiRequest(chatsApi);
      allMessages = data.messages || [];
      if (allMessages.length > 0) {
        conversationId = allMessages[allMessages.length - 1].conversationId || conversationId;
      }
    }

    function formatTime(ts) {
      if (!ts) return 'Just now';
      if (ts.iso) return new Date(ts.iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function render() {
      const convIds = [...new Set(allMessages.map((m) => m.conversationId).filter(Boolean))];
      if (!convIds.includes(conversationId)) convIds.push(conversationId);
      const activeMessages = allMessages.filter((m) => m.conversationId === conversationId);

      root.innerHTML = `
        <div class="copilot-layout">
          <aside class="surface-forest panel-pad" style="display:flex;flex-direction:column;gap:18px;">
            <div>
              <div style="font-size:12px;color:var(--color-sage);font-weight:600;margin-bottom:4px;">Active Context Loaded</div>
              <h2 style="font-size:22px;margin-bottom:6px;">${escapeHtml(activeEvent.name)}</h2>
              <div class="meta-inline text-muted-dark" style="font-size:12.5px;">
                <span>${escapeHtml(activeEvent.type)}</span>
                <span class="meta-sep">·</span>
                <span>${escapeHtml(formatDate(activeEvent.date))}</span>
                <span class="meta-sep">·</span>
                <span>${escapeHtml(formatCurrency(activeEvent.budget, activeEvent.currency))}</span>
              </div>
            </div>

            <button type="button" id="new-chat-btn" class="btn btn-primary" style="width:100%;">New Conversation</button>

            <div>
              <div style="font-size:12px;font-weight:600;color:var(--color-sage);margin-bottom:8px;">Suggested Prompts</div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${SUGGESTED_PROMPTS.map(
                  (p) => `<button type="button" class="btn btn-sm btn-secondary" style="justify-content:flex-start;text-align:left;white-space:normal;height:auto;padding:8px 12px;line-height:1.35;" data-prompt="${escapeHtml(p)}">${escapeHtml(p)}</button>`
                ).join('')}
              </div>
            </div>

            ${
              convIds.length > 1
                ? `<div>
                    <div style="font-size:12px;font-weight:600;color:var(--color-sage);margin-bottom:8px;">Conversations</div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                      ${convIds
                        .slice(-5)
                        .reverse()
                        .map((cid, idx) => {
                          const firstMsg = allMessages.find((m) => m.conversationId === cid);
                          return `<button type="button" class="btn btn-sm ${cid === conversationId ? 'btn-primary' : 'btn-secondary'}" style="justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;" data-switch-conv="${escapeHtml(cid)}">${escapeHtml(firstMsg?.content?.slice(0, 28) || `Session ${idx + 1}`)}</button>`;
                        })
                        .join('')}
                    </div>
                  </div>`
                : ''
            }
          </aside>

          <section class="surface-ivory chat-window">
            <div class="chat-messages" id="chat-scroll-box">
              ${
                activeMessages.length === 0
                  ? `<div class="empty-state" style="margin:auto;max-width:480px;">
                      <h2 style="font-size:28px;">AVENORA AI Co-Pilot</h2>
                      <p class="text-muted-ivory">Your Co-Pilot already knows your event date, guest count, budget, tasks, guests, vendors, timeline, and theme. Ask anything below.</p>
                    </div>`
                  : activeMessages
                      .map(
                        (msg, idx) => `
                        <div class="chat-bubble ${msg.role}">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;font-size:11.5px;opacity:0.7;">
                            <strong>${msg.role === 'assistant' ? 'AVENORA AI' : 'You'}</strong>
                            <span>${escapeHtml(formatTime(msg.createdAt))}</span>
                          </div>
                          <div style="white-space:pre-wrap;">${escapeHtml(msg.content)}</div>
                          ${
                            msg.role === 'assistant'
                              ? `<div style="margin-top:8px;"><button type="button" class="btn btn-sm btn-ivory-outline" style="min-height:28px;padding:4px 10px;font-size:11.5px;" data-copy-msg="${idx}">Copy Response</button></div>`
                              : ''
                          }
                        </div>`
                      )
                      .join('')
              }
              ${
                isThinking
                  ? `<div class="chat-bubble assistant">
                      <div style="display:flex;align-items:center;gap:12px;">
                        <div class="typing-bars" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
                        <span class="text-muted-ivory" style="font-size:13px;">AVENORA AI is analyzing your event workspace...</span>
                      </div>
                    </div>`
                  : ''
              }
            </div>

            <form id="copilot-form" class="chat-composer">
              <textarea id="copilot-input" class="field-textarea" style="min-height:48px;max-height:130px;flex:1;" placeholder="Ask your AI Co-Pilot about budget, schedule, vendors, or next steps..." required></textarea>
              <button type="submit" id="copilot-send" class="btn btn-ivory-primary ${isThinking ? 'is-loading' : ''}" ${isThinking ? 'disabled' : ''}>
                ${isThinking ? '<span class="btn-spinner" aria-hidden="true"></span><span>Thinking...</span>' : 'Send'}
              </button>
            </form>
          </section>
        </div>
      `;

      const scrollBox = document.getElementById('chat-scroll-box');
      if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;

      async function sendMessage(text) {
        const clean = text.trim();
        if (!clean || isThinking) return;

        const userTurn = {
          role: 'user',
          content: clean.slice(0, 11500),
          conversationId,
          createdAt: new Date().toISOString()
        };
        allMessages.push(userTurn);
        isThinking = true;
        render();

        try {
          await apiRequest(chatsApi, {
            method: 'POST',
            body: { role: 'user', content: userTurn.content, conversationId }
          });

          const history = allMessages
            .filter((m) => m.conversationId === conversationId)
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.content }));

          const res = await callAiEndpoint('/api/ai/chat', {
            eventId: activeEvent.id,
            message: clean,
            history
          });

          const replyText = (String(res.reply || '').trim() || 'I could not formulate a response. Please try again.').slice(0, 11900);
          const savedAssistant = await apiRequest(chatsApi, {
            method: 'POST',
            body: { role: 'assistant', content: replyText, conversationId }
          });
          allMessages.push(savedAssistant.turn || {
            role: 'assistant',
            content: replyText,
            conversationId,
            createdAt: new Date().toISOString()
          });
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          isThinking = false;
          render();
        }
      }

      document.getElementById('copilot-form').onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('copilot-input');
        const val = input.value;
        input.value = '';
        sendMessage(val);
      };

      document.getElementById('copilot-input').onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          document.getElementById('copilot-form').requestSubmit();
        }
      };

      document.getElementById('new-chat-btn').onclick = () => {
        conversationId = `conv_${Date.now()}`;
        render();
      };

      root.querySelectorAll('[data-prompt]').forEach((btn) => {
        btn.onclick = () => sendMessage(btn.dataset.prompt);
      });

      root.querySelectorAll('[data-switch-conv]').forEach((btn) => {
        btn.onclick = () => {
          conversationId = btn.dataset.switchConv;
          render();
        };
      });

      root.querySelectorAll('[data-copy-msg]').forEach((btn) => {
        btn.onclick = () => {
          const msg = activeMessages[Number(btn.dataset.copyMsg)];
          if (msg) copyToClipboard(msg.content, 'Co-Pilot response copied.');
        };
      });

      renderIcons();
    }

    await loadMessages();
    render();
  }
});
