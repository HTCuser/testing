import { icon } from './icons.js';

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

/* --------------------------------------------------------------- thông báo */

function toastWrap() {
  let wrap = qs('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

export function toast(message, kind = 'info', ms = 4200) {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  toastWrap().appendChild(node);
  setTimeout(() => node.remove(), ms);
}

/* ------------------------------------------------------------------- modal */

export function openModal({ title, body, footer, wide = false, onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="btn btn-ghost btn-icon" data-close style="margin-left:auto">${icon('close', 18)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  if (onMount) onMount(overlay, close);
  return { overlay, close };
}

export function confirmDialog(message, { title = 'Xác nhận', danger = true } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const { overlay } = openModal({
      title,
      body: `<p style="margin:0;line-height:1.7">${esc(message)}</p>`,
      footer: `
        <button class="btn" data-close>Huỷ</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>Đồng ý</button>`,
      onMount(root, doClose) {
        root.querySelector('[data-ok]').addEventListener('click', () => {
          answer = true;
          doClose();
        });
      },
    });
    new MutationObserver((_, obs) => {
      if (!document.body.contains(overlay)) { obs.disconnect(); resolve(answer); }
    }).observe(document.body, { childList: true });
  });
}

/* ------------------------------------------------------------- markdown nhẹ */

export function markdown(text, { onCite = false } = {}) {
  const lines = esc(text || '').split('\n');
  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const openList = (type) => {
    if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inline(heading[2], onCite)}</h${level}>`);
      continue;
    }
    if (/^&gt;\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''), onCite)}</blockquote>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      openList('ul');
      out.push(`<li>${inline(bullet[1], onCite)}</li>`);
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      openList('ol');
      out.push(`<li>${inline(numbered[1], onCite)}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line, onCite)}</p>`);
  }
  closeList();
  return out.join('');
}

function inline(text, onCite) {
  let html = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  if (onCite) {
    html = html.replace(/\[(\d{1,2})\]/g, '<span class="cite" data-cite="$1">$1</span>');
  }
  return html;
}

/* ---------------------------------------------------------------- định dạng */

export function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function clock() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

/* ------------------------------------------------------ khối trạng thái UI */

export function loading(label = 'Đang tải dữ liệu…') {
  return `<div class="empty"><span class="spinner"></span><p style="margin-top:14px">${esc(label)}</p></div>`;
}

export function emptyState({ iconName = 'file', title, text, actionLabel, actionAttr = '' }) {
  return `
    <div class="empty">
      ${icon(iconName, 42)}
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${actionLabel ? `<button class="btn btn-primary" ${actionAttr}>${icon('plus', 16)}${esc(actionLabel)}</button>` : ''}
    </div>`;
}

export function errorState(message) {
  return `<div class="callout callout-danger">Không tải được dữ liệu: ${esc(message)}</div>`;
}

/* --------------------------------------------- danh sách nhập liệu lặp lại */

export function repeatList(container, { values = [], placeholder = '', fields = null }) {
  const rows = values.length ? values.slice() : [];

  function render() {
    container.innerHTML = rows.map((value, i) => rowMarkup(value, i)).join('') + `
      <button type="button" class="btn btn-sm" data-add>${icon('plus', 14)}Thêm dòng</button>`;
  }

  function rowMarkup(value, i) {
    if (!fields) {
      return `
        <div class="repeat-row">
          <span class="idx">${i + 1}</span>
          <input class="input" data-i="${i}" value="${esc(value)}" placeholder="${esc(placeholder)}">
          <button type="button" class="btn btn-icon btn-danger" data-remove="${i}">${icon('trash', 15)}</button>
        </div>`;
    }
    const inputs = fields.map((f) => `
      <input class="input" data-i="${i}" data-key="${f.key}" value="${esc(value?.[f.key] || '')}"
             placeholder="${esc(f.placeholder)}" style="flex:${f.flex || 1}">`).join('');
    return `
      <div class="repeat-row">
        <span class="idx">${i + 1}</span>
        ${inputs}
        <button type="button" class="btn btn-icon btn-danger" data-remove="${i}">${icon('trash', 15)}</button>
      </div>`;
  }

  container.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      rows.splice(Number(removeBtn.dataset.remove), 1);
      render();
      return;
    }
    if (e.target.closest('[data-add]')) {
      rows.push(fields ? Object.fromEntries(fields.map((f) => [f.key, ''])) : '');
      render();
      const inputs = container.querySelectorAll('input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  });

  container.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-i]');
    if (!input) return;
    const i = Number(input.dataset.i);
    if (fields) {
      rows[i] = rows[i] || {};
      rows[i][input.dataset.key] = input.value;
    } else {
      rows[i] = input.value;
    }
  });

  render();
  return {
    value: () => (fields
      ? rows.filter((r) => Object.values(r).some((v) => String(v || '').trim()))
      : rows.map((r) => String(r).trim()).filter(Boolean)),
  };
}
