import { icon } from './icons.js';
import { clock, esc, qs } from './ui.js';

export const NAV = [
  { section: 'Tổng quan' },
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/tro-ly', label: 'Trợ lý kỹ thuật', icon: 'assistant' },
  { section: 'Thư viện kỹ thuật' },
  { path: '/thu-vien', label: 'Tài liệu kỹ thuật', icon: 'library' },
  { path: '/thiet-bi', label: 'Danh mục thiết bị', icon: 'equipment' },
  { section: 'Nghiệp vụ' },
  { path: '/van-hanh', label: 'Quy trình vận hành', icon: 'operations' },
  { path: '/su-co', label: 'Xử lý sự cố', icon: 'incident' },
  { path: '/bao-duong', label: 'Bảo dưỡng, sửa chữa', icon: 'maintenance' },
  { path: '/bieu-mau', label: 'Phiếu thao tác', icon: 'forms' },
  { section: 'Hệ thống' },
  { path: '/cau-hinh', label: 'Cấu hình', icon: 'settings' },
];

const STORAGE_KEY = 'huana.sidebar.collapsed';

export function buildShell(rootEl, plantName) {
  const collapsed = readCollapsed();
  rootEl.innerHTML = `
    <div class="layout">
      <aside class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon('droplet', 21)}</div>
          <div>
            <div class="brand-name">HUANA<span style="color:#f5821f">+</span></div>
            <div class="brand-sub">Trợ lý kỹ thuật</div>
          </div>
        </div>
        <nav class="nav" id="nav">${navMarkup()}</nav>
        <div class="user-box">
          <div class="avatar">VH</div>
          <div class="user-meta">
            <div class="user-name">Vận hành viên</div>
            <div class="user-role">Ca trực</div>
          </div>
        </div>
        <button class="collapse-btn" id="collapse-btn" title="Thu gọn/mở rộng thanh điều hướng">
          ${icon('chevronLeft', 15)}
        </button>
      </aside>

      <div class="main">
        <header class="topbar">
          <div>
            <h1 class="page-title" id="page-title">${esc(plantName)}</h1>
            <div class="page-sub" id="page-sub"></div>
          </div>
          <div class="topbar-right">
            <span class="live-dot" id="live-clock">Cập nhật: ${clock()}</span>
            <div id="page-actions" style="display:flex;gap:9px;align-items:center"></div>
          </div>
        </header>
        <main class="content" id="view"></main>
        <footer class="footer-bar">
          <span id="footer-status">Hệ thống RAG tra cứu tài liệu kỹ thuật</span>
          <span class="spacer"></span>
          <span>${esc(plantName)} — 2×90 MW</span>
        </footer>
      </div>
    </div>`;

  qs('#collapse-btn').addEventListener('click', () => {
    const sidebar = qs('#sidebar');
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
    qs('#collapse-btn').innerHTML = icon(isCollapsed ? 'chevronRight' : 'chevronLeft', 15);
  });
  qs('#collapse-btn').innerHTML = icon(collapsed ? 'chevronRight' : 'chevronLeft', 15);

  setInterval(() => { qs('#live-clock').textContent = `Cập nhật: ${clock()}`; }, 1000);
}

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function navMarkup() {
  return NAV.map((item) => {
    if (item.section) return `<div class="nav-section">${esc(item.section)}</div>`;
    return `
      <a class="nav-item" href="#${item.path}" data-path="${item.path}" title="${esc(item.label)}">
        ${icon(item.icon, 19)}<span class="nav-label">${esc(item.label)}</span>
      </a>`;
  }).join('');
}

export function highlightNav(path) {
  const root = `/${path.split('/').filter(Boolean)[0] || ''}`;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === root);
  });
}

export function setPage({ title, subtitle = '', actions = '' }) {
  qs('#page-title').textContent = title;
  qs('#page-sub').textContent = subtitle;
  qs('#page-actions').innerHTML = actions;
}

export function setFooter(text) {
  qs('#footer-status').textContent = text;
}

export function view() { return qs('#view'); }

/**
 * Thay phần tử #view bằng một phần tử mới cho mỗi lần điều hướng.
 *
 * Trang cũ có thể còn đang chờ dữ liệu; khi nó hoàn tất, phần tử nó giữ đã bị
 * tách khỏi DOM nên nội dung ghi ra không đè lên trang hiện tại, và nó tự dừng
 * lại nhờ kiểm tra `isStale`.
 */
export function resetView() {
  const current = qs('#view');
  const fresh = document.createElement('main');
  fresh.className = 'content';
  fresh.id = 'view';
  current.replaceWith(fresh);
  return fresh;
}

export function isStale(root) { return !root.isConnected; }
