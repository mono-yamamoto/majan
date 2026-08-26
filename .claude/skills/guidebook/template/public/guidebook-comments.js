(() => {
  const DRAFT_PREFIX = 'guidebook-comment-draft:';

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'attrs') for (const [ak, av] of Object.entries(v)) node.setAttribute(ak, av);
      else node[k] = v;
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const m = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${m(d.getMonth() + 1)}-${m(d.getDate())} ${m(d.getHours())}:${m(d.getMinutes())}`;
    } catch {
      return iso;
    }
  }

  function currentPageTitle() {
    const h1 = document.querySelector('.sl-markdown-content h1, main h1');
    if (h1) return h1.textContent.replace(/💬/g, '').trim();
    return document.title.replace(/\s*[|｜]\s*Guidebook\s*$/, '').trim() || null;
  }

  async function apiSave({ sectionId, sectionText, body }) {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        page: location.pathname,
        pageTitle: currentPageTitle(),
        section: sectionId ? { id: sectionId, text: sectionText } : null,
        body,
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  }

  async function apiDelete(id) {
    const res = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  }

  async function apiList() {
    const res = await fetch('/api/comments', { headers: { 'content-type': 'application/json' } });
    if (!res.ok) return { comments: [], unsentCount: 0 };
    return await res.json();
  }

  async function apiNotify() {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return res;
  }

  function flashToast(text) {
    const t = el('div', { class: 'gb-comment-toast' }, text);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('gb-comment-toast--visible'));
    setTimeout(() => {
      t.classList.remove('gb-comment-toast--visible');
      setTimeout(() => t.remove(), 300);
    }, 2400);
  }

  let badgeEl = null;
  function renderBadge(count) {
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.textContent = String(count);
      badgeEl.classList.add('gb-comment-fab__badge--visible');
    } else {
      badgeEl.textContent = '';
      badgeEl.classList.remove('gb-comment-fab__badge--visible');
    }
  }

  function renderCommentItem(record, area) {
    const isClaude = record.author === 'claude';
    const classes = ['gb-comment-item'];
    if (record.sent && !isClaude) classes.push('gb-comment-item--sent');
    if (isClaude) classes.push('gb-comment-item--claude');
    const item = el('div', { class: classes.join(' '), dataset: { id: record.id } });

    let statusLabel;
    if (isClaude) statusLabel = 'Claude';
    else if (record.sent) statusLabel = '送信済み';
    else statusLabel = '未送信';
    const status = el('span', { class: 'gb-comment-item__status' }, statusLabel);

    const time = el('time', { class: 'gb-comment-item__time' }, formatTime(record.timestamp));
    const delBtn = el(
      'button',
      {
        class: 'gb-comment-item__delete',
        type: 'button',
        title: 'コメントを削除',
        attrs: { 'aria-label': 'コメントを削除' },
        onclick: async (e) => {
          e.stopPropagation();
          if (!window.confirm('このコメントを削除する?')) return;
          try {
            await apiDelete(record.id);
            await refreshAll();
            flashToast('削除しました');
          } catch (err) {
            console.error('[guidebook-comments] delete failed', err);
            alert('削除失敗: ' + err.message);
          }
        },
      },
      '✕',
    );
    const meta = el('div', { class: 'gb-comment-item__meta' }, status, time, delBtn);
    const body = el('div', { class: 'gb-comment-item__body' }, record.body);
    item.append(meta, body);
    return item;
  }

  function renderList(area, records) {
    let list = area.querySelector('.gb-comment-list');
    if (!list) {
      list = el('div', { class: 'gb-comment-list' });
      const form = area.querySelector('.gb-comment-form');
      form.insertBefore(list, form.firstChild);
    }
    list.replaceChildren();
    if (records.length === 0) {
      list.classList.add('gb-comment-list--empty');
      list.appendChild(el('p', { class: 'gb-comment-list__empty' }, 'まだコメントはありません'));
    } else {
      list.classList.remove('gb-comment-list--empty');
      for (const r of records) list.appendChild(renderCommentItem(r, area));
    }
  }

  function statusLabelFor(c) {
    if (c.author === 'claude') return 'Claude';
    if (c.sent) return '送信済み';
    return '未送信';
  }

  function statusClassFor(c) {
    if (c.author === 'claude') return 'gb-dropdown-item--claude';
    if (c.sent) return 'gb-dropdown-item--sent';
    return 'gb-dropdown-item--unsent';
  }

  let outsideHandler = null;

  function findHeaderSlot() {
    return (
      document.querySelector('header.header .right-group') ||
      document.querySelector('header.header > div.header') ||
      document.querySelector('header[role="banner"]') ||
      document.querySelector('header')
    );
  }

  function injectHeaderDropdown(comments) {
    const host = findHeaderSlot();
    if (!host) return;

    let wrap = host.querySelector(':scope > .gb-header-comments');
    if (!wrap) {
      wrap = el('div', { class: 'gb-header-comments' });
      host.appendChild(wrap);
    }
    wrap.replaceChildren();

    const count = comments.length;
    const unsent = comments.filter((c) => !c.sent && c.author !== 'claude').length;

    const countSpan = el('span', { class: 'gb-header-comments__count' });
    if (unsent > 0) {
      countSpan.textContent = `${count}(${unsent})`;
      countSpan.classList.add('gb-header-comments__count--has-unsent');
    } else if (count > 0) {
      countSpan.textContent = String(count);
    } else {
      countSpan.textContent = '0';
      countSpan.classList.add('gb-header-comments__count--zero');
    }

    const btn = el(
      'button',
      {
        class: 'gb-header-comments__button',
        type: 'button',
        attrs: { 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      },
      el('span', { class: 'gb-header-comments__label' }, '💬 コメント'),
      countSpan,
    );

    const panel = el('div', { class: 'gb-header-comments__panel', attrs: { role: 'listbox' } });

    if (count === 0) {
      panel.appendChild(
        el('p', { class: 'gb-header-comments__empty' }, 'まだコメントはありません'),
      );
    } else {
      const sorted = [...comments].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      for (const c of sorted) {
        const href = c.section ? `${c.page}#${encodeURIComponent(c.section.id)}` : c.page;
        const item = el('a', {
          class: `gb-dropdown-item ${statusClassFor(c)}`,
          href,
          attrs: { role: 'option' },
        });

        item.addEventListener('click', (e) => {
          if (e.target.closest('.gb-dropdown-item__delete')) return;
          wrap.classList.remove('gb-header-comments--open');
          btn.setAttribute('aria-expanded', 'false');
          if (c.page === location.pathname) {
            e.preventDefault();
            const targetId = c.section ? c.section.id : null;
            const target = targetId ? document.getElementById(targetId) : null;
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              history.replaceState(null, '', `${c.page}#${encodeURIComponent(targetId)}`);
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              history.replaceState(null, '', c.page);
            }
          }
        });

        const heading = el(
          'div',
          { class: 'gb-dropdown-item__heading' },
          el(
            'span',
            { class: 'gb-dropdown-item__pagetitle' },
            c.pageTitle || c.page || '(ページ不明)',
          ),
          c.section
            ? el('span', { class: 'gb-dropdown-item__section' }, c.section.text)
            : el('span', { class: 'gb-dropdown-item__section-empty' }, 'ページ全体'),
        );

        const deleteBtn = el(
          'button',
          {
            class: 'gb-dropdown-item__delete',
            type: 'button',
            title: 'コメントを解決（削除）',
            attrs: { 'aria-label': 'コメントを解決（削除）' },
            onclick: async (e) => {
              e.stopPropagation();
              e.preventDefault();
              if (!window.confirm('このコメントを解決（削除）する?')) return;
              try {
                await apiDelete(c.id);
                await refreshAll();
                flashToast('解決しました');
              } catch (err) {
                console.error('[guidebook-comments] delete failed', err);
                alert('削除失敗: ' + err.message);
              }
            },
          },
          '✕',
        );

        const meta = el(
          'div',
          { class: 'gb-dropdown-item__meta' },
          el('span', { class: 'gb-dropdown-item__status' }, statusLabelFor(c)),
          el('span', { class: 'gb-dropdown-item__page' }, c.page),
          el('time', { class: 'gb-dropdown-item__time' }, formatTime(c.timestamp)),
          deleteBtn,
        );
        const body = el('div', { class: 'gb-dropdown-item__body' }, c.body);
        item.append(heading, meta, body);
        panel.appendChild(item);
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = wrap.classList.toggle('gb-header-comments--open');
      btn.setAttribute('aria-expanded', String(open));
    });

    if (outsideHandler) document.removeEventListener('click', outsideHandler);
    outsideHandler = (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('gb-header-comments--open');
        btn.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('click', outsideHandler);

    wrap.append(btn, panel);
  }

  async function refreshAll() {
    const { comments, unsentCount } = await apiList();
    renderBadge(unsentCount);

    const areas = document.querySelectorAll('.gb-comment-inline');
    areas.forEach((area) => {
      const sectionId = area.dataset.section;
      const isFloating = sectionId === '_page';
      const filtered = comments.filter((c) => {
        if (c.page !== location.pathname) return false;
        if (isFloating) return c.section === null;
        return c.section && c.section.id === sectionId;
      });
      renderList(area, filtered);

      if (area.dataset.gbExpandInit !== '1') {
        if (filtered.length > 0) {
          area.classList.add('gb-comment-inline--expanded');
          const expandBtn = area.querySelector('.gb-comment-expand');
          if (expandBtn) expandBtn.setAttribute('aria-expanded', 'true');
        }
        area.dataset.gbExpandInit = '1';
      }
    });

    injectHeaderDropdown(comments);
  }

  function createInlineComment({ sectionId, sectionText, variant }) {
    const root = el('div', {
      class: `gb-comment-inline gb-comment-inline--${variant}`,
      dataset: { section: sectionId ?? '_page' },
    });

    const draftKey = `${DRAFT_PREFIX}${location.pathname}:${sectionId ?? '_page'}`;
    const buttonLabel = variant === 'floating' ? '💬 ページ全体にコメント' : '💬 このセクションにコメント';

    const expandBtn = el(
      'button',
      { class: 'gb-comment-expand', type: 'button' },
      buttonLabel,
    );

    const textarea = el('textarea', {
      class: 'gb-comment-textarea',
      rows: 4,
      placeholder: '気になった点、修正案、図解の追加リクエストなど...',
    });
    textarea.value = sessionStorage.getItem(draftKey) ?? '';
    textarea.addEventListener('input', () => sessionStorage.setItem(draftKey, textarea.value));

    const status = el('span', { class: 'gb-comment-status' });

    const cancelBtn = el(
      'button',
      { class: 'gb-comment-cancel', type: 'button' },
      'キャンセル',
    );

    const submitBtn = el(
      'button',
      { class: 'gb-comment-submit', type: 'button' },
      'コメント',
    );

    const form = el(
      'div',
      { class: 'gb-comment-form' },
      textarea,
      el('div', { class: 'gb-comment-form__row' },
        status,
        el('div', { class: 'gb-comment-actions' }, cancelBtn, submitBtn),
      ),
    );

    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitBtn.click();
      }
    });

    function setExpanded(v) {
      root.classList.toggle('gb-comment-inline--expanded', v);
      expandBtn.setAttribute('aria-expanded', String(v));
      if (v) {
        requestAnimationFrame(() => textarea.focus());
      }
    }
    setExpanded(false);

    expandBtn.addEventListener('click', () => {
      const isExpanded = root.classList.contains('gb-comment-inline--expanded');
      setExpanded(!isExpanded);
    });

    cancelBtn.addEventListener('click', () => {
      textarea.value = '';
      sessionStorage.removeItem(draftKey);
      setExpanded(false);
    });

    submitBtn.addEventListener('click', async () => {
      const body = textarea.value.trim();
      if (!body) {
        textarea.focus();
        return;
      }
      submitBtn.disabled = true;
      status.textContent = '';
      status.className = 'gb-comment-status';
      try {
        await apiSave({ sectionId, sectionText, body });
        textarea.value = '';
        sessionStorage.removeItem(draftKey);
        status.textContent = '保存しました ✓';
        status.classList.add('gb-comment-status--success');
        await refreshAll();
        setTimeout(() => {
          status.textContent = '';
          status.className = 'gb-comment-status';
        }, 1400);
      } catch (err) {
        console.error('[guidebook-comments] failed to save', err);
        status.textContent = '保存に失敗: ' + err.message;
        status.classList.add('gb-comment-status--error');
      } finally {
        submitBtn.disabled = false;
      }
    });

    root.appendChild(expandBtn);
    root.appendChild(form);
    return root;
  }

  function isHeading(node) {
    return /^H[1-6]$/.test(node.tagName);
  }
  function headingLevel(node) {
    return Number.parseInt(node.tagName.slice(1), 10);
  }
  function nodeHeadingLevel(node) {
    if (isHeading(node)) return headingLevel(node);
    if (node.classList && node.classList.contains('sl-heading-wrapper')) {
      const h = node.querySelector('h1, h2, h3, h4, h5, h6');
      if (h) return headingLevel(h);
    }
    return null;
  }

  function findSectionEnd(heading) {
    const start = heading.closest('.sl-heading-wrapper') || heading;
    const level = headingLevel(heading);
    let curr = start.nextElementSibling;
    let last = start;
    while (curr) {
      const nextLevel = nodeHeadingLevel(curr);
      if (nextLevel !== null && nextLevel <= level) break;
      if (curr.classList && curr.classList.contains('gb-comment-inline')) break;
      last = curr;
      curr = curr.nextElementSibling;
    }
    return last;
  }

  function addSectionCommentAreas() {
    const headings = document.querySelectorAll(
      '.sl-markdown-content h2[id], .sl-markdown-content h3[id], main h2[id], main h3[id]',
    );
    headings.forEach((h) => {
      if (h.dataset.gbCommentInjected === '1') return;
      h.dataset.gbCommentInjected = '1';
      const end = findSectionEnd(h);
      const area = createInlineComment({
        sectionId: h.id,
        sectionText: h.textContent.replace(/💬/g, '').trim(),
        variant: 'inline',
      });
      end.parentNode.insertBefore(area, end.nextSibling);
    });
  }

  async function sendToClaude() {
    try {
      const res = await apiNotify();
      if (res.status === 409) {
        flashToast('未送信のコメントがありません');
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      flashToast(`${data.sentCount} 件を Claude に送りました`);
      await refreshAll();
    } catch (err) {
      console.error('[guidebook-comments] notify failed', err);
      flashToast('通知に失敗: ' + err.message);
    }
  }

  function addFloatingPanel() {
    if (document.querySelector('.gb-fab-wrap')) return;

    const floatingComment = createInlineComment({
      sectionId: null,
      sectionText: '',
      variant: 'floating',
    });

    badgeEl = el('span', { class: 'gb-comment-fab__badge' });
    const sendBtn = el(
      'button',
      {
        class: 'gb-comment-fab gb-comment-fab--send',
        type: 'button',
        title: 'Claude にコメントを送る',
        attrs: { 'aria-label': 'Claude にコメントを送る' },
        onclick: sendToClaude,
      },
      el('span', {}, 'Claude に送る'),
      badgeEl,
    );

    const wrap = el('div', { class: 'gb-fab-wrap' }, floatingComment, sendBtn);
    document.body.appendChild(wrap);
  }

  function init() {
    addSectionCommentAreas();
    addFloatingPanel();
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('astro:page-load', init);
})();
