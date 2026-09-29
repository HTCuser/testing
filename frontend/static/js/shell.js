import { api } from './api.js';
import { icon } from './icons.js';
import { changePasswordDialog } from './login.js';
import { initials } from './session.js';
import { clock, esc, qs } from './ui.js';

export const NAV = [
  { section: 'Tổng quan' },
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/tro-ly', label: 'Trợ lý kỹ thuật', icon: 'assistant' },
  { section: 'Thư viện kỹ thuật' },
  { path: '/quy-trinh-vh', label: 'Quy trình VH & XLSC', icon: 'file' },
  { path: '/quy-trinh-bd', label: 'Quy trình BD, SC', icon: 'layers' },
  { path: '/thu-vien', label: 'Tài liệu kỹ thuật', icon: 'library' },
  { path: '/thiet-bi', label: 'Danh mục thiết bị', icon: 'equipment' },
  { section: 'Nghiệp vụ' },
  { path: '/phieu-thao-tac', label: 'Phiếu thao tác', icon: 'forms' },
  { path: '/ptt-mau', label: 'Phiếu thao tác mẫu', icon: 'layers' },
  { path: '/thao-tac', label: 'Thao tác vận hành', icon: 'operations' },
  { path: '/su-co', label: 'Xử lý bất thường, sự cố', icon: 'incident' },
  { path: '/sua-chua', label: 'Bảo dưỡng, sửa chữa', icon: 'maintenance' },
  { section: 'Hệ thống' },
  { path: '/cau-hinh', label: 'Cấu hình', icon: 'settings' },
  { path: '/quan-tri', label: 'Quản trị', icon: 'shield', perm: 'quan_tri' },
];

const STORAGE_KEY = 'huana.sidebar.collapsed';

export function buildShell(rootEl, plantName, user = null) {
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
        <button class="user-box" id="user-box" type="button" title="Đổi mật khẩu, đăng xuất">
          <div class="avatar">${esc(initials(user?.full_name || ''))}</div>
          <div class="user-meta">
            <div class="user-name">${esc(user?.full_name || 'Chưa đăng nhập')}</div>
            <div class="user-role">${esc(user?.role_label || '')}</div>
          </div>
        </button>
        <div class="user-menu" id="user-menu" hidden>
          <div class="user-menu-head">${esc(user?.full_name || '')}<span>${esc(user?.username || '')}${user?.title ? ` · ${esc(user.title)}` : ''}</span></div>
          <button type="button" data-um="password">${icon('shield', 16)}Đổi mật khẩu</button>
          <button type="button" data-um="logout">${icon('chevronLeft', 16)}Đăng xuất</button>
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

  const timer = setInterval(() => {
    const el = qs('#live-clock');
    // Khung đã bị thay bằng màn hình đăng nhập (phiên hết hạn).
    if (!el) { clearInterval(timer); return; }
    el.textContent = `Cập nhật: ${clock()}`;
  }, 1000);

  const menu = qs('#user-menu');
  qs('#user-box').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
  menu.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-um]')?.dataset.um;
    if (!act) return;
    menu.hidden = true;
    if (act === 'password') changePasswordDialog();
    if (act === 'logout') {
      try { await api.logout(); } catch { /* phiên đã hết thì cũng coi như đã đăng xuất */ }
      window.location.hash = '#/';
      window.location.reload();
    }
  });
}

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function navMarkup() {
  return NAV.map((item) => {
    if (item.section) return `<div class="nav-section">${esc(item.section)}</div>`;
    return `
      <a class="nav-item" href="#${item.path}" data-path="${item.path}" title="${esc(item.label)}"${item.perm ? ` data-perm="${item.perm}"` : ''}>
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
