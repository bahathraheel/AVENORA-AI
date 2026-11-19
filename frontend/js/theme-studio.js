import { apiRequest, callAiEndpoint } from './api.js';
import {
  copyToClipboard,
  escapeHtml,
  initProtectedPage,
  openConfirmModal,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

initProtectedPage({
  activeKey: 'theme',
  pageTitle: 'AI Theme Studio',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('theme-studio-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event for Theme Studio');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/themes`;
    let savedThemes = [];
    let draftTheme = null;
    let compareIds = [];

    async function loadThemes() {
      const data = await apiRequest(apiBase);
      savedThemes = data.themes || [];
      if (!draftTheme && savedThemes.length > 0) {
        draftTheme = savedThemes[0];
      }
    }

    function renderThemeSheet(theme, isSaved) {
      if (!theme) {
        return `<div class="surface-ivory panel-pad">
          <div class="empty-state">
            <h2 style="font-size:28px;">Craft Your Event Aesthetic</h2>
            <p class="text-muted-ivory" style="max-width:52ch;">Describe a mood or click "Generate Theme Concept" to build HEX color palettes, lighting, florals, table styling, materials, and a moodboard composition.</p>
          </div>
        </div>`;
      }

      const roles = theme.moodboardSpecs?.colorRoles || [];
      const panels = theme.moodboardSpecs?.moodboardPanels || [];

      return `
        <div class="surface-ivory panel-pad">
          <div class="panel-head">
            <div>
              <div class="meta-inline text-muted-ivory" style="font-size:12.5px;margin-bottom:4px;">
                <span>${isSaved ? 'Saved Theme' : 'Generated Draft'}</span>
                <span class="meta-sep">·</span>
                <span>${escapeHtml(activeEvent.style)}</span>
              </div>
              <h2 style="font-size:32px;">${escapeHtml(theme.name)}</h2>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="copy-theme-btn" class="btn btn-sm btn-ivory-outline">Copy Brief</button>
              ${
                !isSaved
                  ? `<button type="button" id="save-theme-btn" class="btn btn-sm btn-ivory-primary">Save Theme</button>`
                  : ''
              }
            </div>
          </div>

          <p style="font-size:15.5px;margin-bottom:22px;">${escapeHtml(theme.description)}</p>

          <h3 style="font-size:22px;margin-bottom:12px;">Color Palette Swatches (Click to copy HEX)</h3>
          <div class="swatch-row" style="margin-bottom:24px;">
            ${(theme.palette || [])
              .map((hex, idx) => {
                const role = roles[idx];
                return `
                  <div class="swatch-card" data-copy-hex="${escapeHtml(hex)}">
                    <div class="swatch-color" style="background:${escapeHtml(hex)};"></div>
                    <div style="padding:10px 12px;">
                      <strong class="tabular-nums" style="font-size:13px;">${escapeHtml(hex)}</strong>
                      ${role ? `<div style="font-size:12px;margin-top:2px;">${escapeHtml(role.name)}</div><div class="text-muted-ivory" style="font-size:11px;">${escapeHtml(role.usage)}</div>` : ''}
                    </div>
                  </div>`;
              })
              .join('')}
          </div>

          <h3 style="font-size:22px;margin-bottom:6px;">Editorial Moodboard Layout</h3>
          <p class="text-muted-ivory" style="font-size:12.5px;margin-bottom:14px;">
            Art-directed visual composition placeholders outlining real styling briefs and palette pairings.
          </p>
          <div class="moodboard-grid" style="margin-bottom:24px;">
            ${(panels.length
              ? panels
              : [
                  { zone: 'Venue & Architecture', visualBrief: theme.venueStyling, keyElements: theme.lighting },
                  { zone: 'Tablescape & Florals', visualBrief: theme.tableStyling, keyElements: theme.floral },
                  { zone: 'Materials & Textures', visualBrief: theme.materials, keyElements: theme.decoration },
                  { zone: 'Stationery & Attire', visualBrief: theme.invitationConcept, keyElements: theme.dressCode }
                ]
            )
              .map((panel, idx) => {
                const bg = theme.palette?.[idx % (theme.palette?.length || 1)] || '#14251C';
                return `
                  <div class="moodboard-placeholder-panel" style="background:linear-gradient(155deg, ${escapeHtml(bg)}18, #FFFFFF);">
                    <div class="meta-inline" style="font-size:11.5px;color:rgba(20,37,28,0.68);">
                      <span>Moodboard Placeholder ${idx + 1}</span>
                      <span class="meta-sep">·</span>
                      <span>${escapeHtml(panel.zone)}</span>
                    </div>
                    <div>
                      <strong style="display:block;font-size:16px;margin-bottom:4px;">${escapeHtml(panel.zone)}</strong>
                      <p class="text-muted-ivory" style="font-size:13.5px;">${escapeHtml(panel.visualBrief)}</p>
                    </div>
                    <div style="font-size:12.5px;font-weight:600;color:var(--color-forest-deep);">Key elements: ${escapeHtml(panel.keyElements)}</div>
                  </div>`;
              })
              .join('')}
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
            ${[
              ['Decoration Concepts', theme.decoration],
              ['Lighting Design', theme.lighting],
              ['Floral Suggestions', theme.floral],
              ['Table Styling', theme.tableStyling],
              ['Venue Styling', theme.venueStyling],
              ['Dress Code', theme.dressCode],
              ['Invitation Styling', theme.invitationConcept],
              ['Materials & Fabrics', theme.materials],
              ['Budget-Friendly Alternatives', theme.budgetAlternatives]
            ]
              .map(
                ([title, content]) => `
                <div style="padding:14px;background:#fff;border-radius:10px;border:var(--border-ivory);">
                  <strong style="display:block;margin-bottom:4px;">${title}</strong>
                  <p class="text-muted-ivory" style="font-size:13.5px;">${escapeHtml(content || '—')}</p>
                </div>`
              )
              .join('')}
          </div>
        </div>
      `;
    }

    function render() {
      const isCurrentSaved = Boolean(draftTheme && draftTheme.id);
      const compared = savedThemes.filter((t) => compareIds.includes(t.id));

      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">AI Theme Studio</h1>
              <p class="text-muted-dark" style="font-size:14px;">Develop palettes, florals, lighting, materials, and side-by-side aesthetic directions.</p>
            </div>
            <form id="theme-gen-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <input id="theme-direction" class="field-input field-input-dark" style="min-width:260px;" placeholder="e.g., Candlelit botanical conservatory with brass" />
              <button type="submit" id="gen-theme-btn" class="btn btn-primary">${draftTheme ? 'Regenerate Theme' : 'Generate Theme Concept'}</button>
            </form>
          </div>
          <div id="theme-loader" style="margin-top:12px;"></div>
        </section>

        <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start;">
          <aside class="surface-ivory panel-pad">
            <h2 style="font-size:22px;margin-bottom:12px;">Saved Themes (${savedThemes.length})</h2>
            ${
              savedThemes.length === 0
                ? `<p class="text-muted-ivory" style="font-size:13.5px;">Generate and save themes to build your studio library and compare directions.</p>`
                : `<div style="display:flex;flex-direction:column;gap:10px;">
                    ${savedThemes
                      .map(
                        (t) => `
                        <div style="padding:12px;border-radius:10px;border:var(--border-ivory);background:${draftTheme?.id === t.id ? '#14251C' : '#fff'};color:${draftTheme?.id === t.id ? '#F5F3ED' : '#14251C'};">
                          <div style="font-weight:600;font-size:14px;cursor:pointer;" data-open-theme="${escapeHtml(t.id)}">${escapeHtml(t.name)}</div>
                          <div style="display:flex;gap:4px;margin-block:8px;">
                            ${(t.palette || []).map((hex) => `<span style="width:18px;height:18px;border-radius:4px;background:${escapeHtml(hex)};border:1px solid rgba(0,0,0,0.12);"></span>`).join('')}
                          </div>
                          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                              <input type="checkbox" data-compare-theme="${escapeHtml(t.id)}" ${compareIds.includes(t.id) ? 'checked' : ''} />
                              <span>Compare</span>
                            </label>
                            <button type="button" data-del-theme="${escapeHtml(t.id)}" style="background:none;border:none;color:inherit;opacity:0.75;cursor:pointer;">Delete</button>
                          </div>
                        </div>`
                      )
                      .join('')}
                  </div>`
            }
          </aside>

          <div class="module-stack">
            ${renderThemeSheet(draftTheme, isCurrentSaved)}

            ${
              compared.length >= 2
                ? `<section class="surface-ivory panel-pad">
                    <h2 style="font-size:24px;margin-bottom:14px;">Theme Comparison</h2>
                    <div style="display:grid;grid-template-columns:repeat(${Math.min(2, compared.length)},1fr);gap:16px;">
                      ${compared
                        .slice(0, 2)
                        .map(
                          (c) => `
                          <div style="padding:16px;background:#fff;border-radius:10px;border:var(--border-ivory);">
                            <h3 style="font-size:22px;margin-bottom:6px;">${escapeHtml(c.name)}</h3>
                            <div style="display:flex;gap:6px;margin-bottom:10px;">
                              ${(c.palette || []).map((h) => `<span style="width:24px;height:24px;border-radius:6px;background:${escapeHtml(h)};"></span>`).join('')}
                            </div>
                            <p class="text-muted-ivory" style="font-size:13px;margin-bottom:8px;"><strong>Lighting:</strong> ${escapeHtml(c.lighting)}</p>
                            <p class="text-muted-ivory" style="font-size:13px;margin-bottom:8px;"><strong>Florals:</strong> ${escapeHtml(c.floral)}</p>
                            <p class="text-muted-ivory" style="font-size:13px;"><strong>Budget Fit:</strong> ${escapeHtml(c.budgetAlternatives)}</p>
                          </div>`
                        )
                        .join('')}
                    </div>
                  </section>`
                : ''
            }
          </div>
        </div>
      `;

      document.getElementById('theme-gen-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('gen-theme-btn');
        const loader = document.getElementById('theme-loader');
        setButtonLoading(btn, true, 'Designing Theme...');
        loader.innerHTML = `<div class="ai-loading-box"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Designing custom palette, lighting, florals, and moodboard layout...</span><span class="ai-loading-sub">Curating cohesive textures, dress code notes, and invitation styling.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/generate-theme', {
            event: activeEvent,
            direction: document.getElementById('theme-direction').value.trim()
          });
          draftTheme = res.theme;
          render();
        } catch (err) {
          loader.innerHTML = '';
          setButtonLoading(btn, false);
          showToast(err.message, 'error');
        }
      };

      document.getElementById('save-theme-btn')?.addEventListener('click', async () => {
        if (!draftTheme) return;
        try {
          const res = await apiRequest(apiBase, { method: 'POST', body: draftTheme });
          draftTheme = res.theme;
          await loadThemes();
          render();
          showToast('Theme saved to studio library.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('copy-theme-btn')?.addEventListener('click', () => {
        if (!draftTheme) return;
        const text = `${draftTheme.name}\nPalette: ${(draftTheme.palette || []).join(', ')}\n\n${draftTheme.description}\n\nDecoration: ${draftTheme.decoration}\nLighting: ${draftTheme.lighting}\nFlorals: ${draftTheme.floral}\nTable Styling: ${draftTheme.tableStyling}`;
        copyToClipboard(text, 'Theme specification copied.');
      });

      root.querySelectorAll('[data-copy-hex]').forEach((el) => {
        el.onclick = () => copyToClipboard(el.dataset.copyHex, `Copied ${el.dataset.copyHex}`);
      });

      root.querySelectorAll('[data-open-theme]').forEach((el) => {
        el.onclick = () => {
          draftTheme = savedThemes.find((t) => t.id === el.dataset.openTheme) || null;
          render();
        };
      });

      root.querySelectorAll('[data-compare-theme]').forEach((cb) => {
        cb.onchange = () => {
          const id = cb.dataset.compareTheme;
          if (cb.checked) {
            compareIds = [...compareIds.slice(-1), id];
          } else {
            compareIds = compareIds.filter((x) => x !== id);
          }
          render();
        };
      });

      root.querySelectorAll('[data-del-theme]').forEach((btn) => {
        btn.onclick = () => {
          const t = savedThemes.find((x) => x.id === btn.dataset.delTheme);
          openConfirmModal({
            title: 'Delete Saved Theme?',
            message: `Remove "${t?.name}" from your saved themes?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                if (draftTheme?.id === t.id) draftTheme = null;
                compareIds = compareIds.filter((x) => x !== t.id);
                await loadThemes();
                render();
                showToast('Theme deleted.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });

      renderIcons();
    }

    await loadThemes();
    render();
  }
});
