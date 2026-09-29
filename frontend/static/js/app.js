import { api } from './api.js';
import * as assistant from './pages/assistant.js';
import * as dashboard from './pages/dashboard.js';
import * as equipment from './pages/equipment.js';
import * as forms from './pages/forms.js';
import * as incidents from './pages/incidents.js';
import { createJournalPage } from './pages/journal.js';
import { createLibraryPage } from './pages/library.js';
import { createProceduresPage } from './pages/procedures.js';
import { changePasswordDialog, renderLogin, renderOffline, renderSetup } from './login.js';
import { setOrg } from './print.js';
import { setSession } from './session.js';
import * as ptt from './pages/ptt.js';
import * as pttTemplates from './pages/ptt-templates.js';
import * as admin from './pages/admin.js';
import * as settings from './pages/settings.js';
import { register, setNavigationHook, start } from './router.js';
import { buildShell, highlightNav, resetView, setFooter, setPage } from './shell.js';
import { errorState, toast } from './ui.js';

const operations = createProceduresPage({
  kind: 'van_hanh',
  basePath: '/van-hanh',
  title: 'Quy trình vận hành',
  subtitle: 'Trình tự thao tác chuẩn cho vận hành viên, tra cứu nhanh và in ra khi cần',
  iconName: 'operations',
  tone: 'green',
});

const maintenance = createProceduresPage({
  kind: 'bao_duong',
  basePath: '/bao-duong',
  title: 'Bảo dưỡng và sửa chữa',
  subtitle: 'Quy trình bảo dưỡng định kỳ, sửa chữa thiết bị cho tổ sửa chữa',
  iconName: 'maintenance',
  tone: 'amber',
});

const libraryVH = createLibraryPage('vh');
const libraryBD = createLibraryPage('bd');
const libraryDocs = createLibraryPage('tl');

const operationLog = createJournalPage({
  kind: 'thao_tac',
  basePath: '/thao-tac',
  title: 'Thao tác vận hành',
  subtitle: 'Vận hành viên ghi lại các thao tác đã thực hiện, để tra cứu và tham khảo cho lần sau',
  addLabel: 'GHI THAO TÁC',
  placeholder: 'Tìm theo nội dung, thiết bị, người thực hiện, số phiếu…',
});

const maintenanceLog = createJournalPage({
  kind: 'bao_duong',
  basePath: '/sua-chua',
  title: 'Bảo dưỡng, sửa chữa',
  subtitle: 'Ghi lại các đợt bảo dưỡng, sửa chữa: nội dung công việc, vật tư thay thế, hư hỏng phát hiện',
  addLabel: 'GHI CÔNG VIỆC',
  placeholder: 'Tìm theo công việc, thiết bị, vật tư, số phiếu công tác…',
});

// Trang quy trình nhập tay (/van-hanh, /bao-duong) và trình tự thao tác mẫu
// (/bieu-mau) không còn trên menu — thư viện nay là các file quy trình của nhà
// máy, PTT mẫu là file Word. Vẫn giữ đường dẫn để trích dẫn cũ của trợ lý và dữ
// liệu đã nhập vẫn mở được.
const PAGES = [
  ['/', dashboard],
  ['/tro-ly', assistant],
  ['/quy-trinh-vh', libraryVH],
  ['/quy-trinh-vh/:id', libraryVH],
  ['/quy-trinh-bd', libraryBD],
  ['/quy-trinh-bd/:id', libraryBD],
  ['/thu-vien', libraryDocs],
  ['/thu-vien/:id', libraryDocs],
  ['/thao-tac', operationLog],
  ['/thao-tac/moi', operationLog],
  ['/thao-tac/:id', operationLog],
  ['/thao-tac/:id/sua', operationLog],
  ['/sua-chua', maintenanceLog],
  ['/sua-chua/moi', maintenanceLog],
  ['/sua-chua/:id', maintenanceLog],
  ['/sua-chua/:id/sua', maintenanceLog],
  ['/thiet-bi', equipment],
  ['/thiet-bi/:id', equipment],
  ['/van-hanh', operations],
  ['/van-hanh/:id', operations],
  ['/bao-duong', maintenance],
  ['/bao-duong/:id', maintenance],
  ['/su-co', incidents],
  ['/su-co/:id', incidents],
  ['/phieu-thao-tac', ptt],
  ['/phieu-thao-tac/moi', ptt],
  ['/phieu-thao-tac/:id', ptt],
  ['/ptt-mau', pttTemplates],
  ['/bieu-mau', forms],
  ['/bieu-mau/:id', forms],
  ['/cau-hinh', settings],
  ['/quan-tri', admin],
];

PAGES.forEach(([path, page]) => register(path, page));

setNavigationHook(async (location, found) => {
  const root = resetView();
  highlightNav(location.path);
  window.scrollTo({ top: 0 });

  if (!found) {
    setPage({ title: 'Không tìm thấy trang', subtitle: location.path });
    root.innerHTML = `
      <div class="empty">
        <h3>Đường dẫn không tồn tại</h3>
        <p>${location.path}</p>
        <a class="btn btn-primary" href="#/">Về Dashboard</a>
      </div>`;
    return;
  }

  try {
    await found.route.handler.render(root, { params: found.params, query: location.query });
  } catch (err) {
    console.error(err);
    root.innerHTML = errorState(err.message);
    toast(err.message, 'error');
  }
});

let plantName = 'Nhà máy Thủy điện Hủa Na';
let loginShown = false;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), ms); })]);
}

// Phiên hết hạn giữa chừng (hoặc bị quản trị khoá): hiện màn hình đăng nhập.
window.addEventListener('huana:auth-required', () => {
  if (loginShown) return;
  loginShown = true;
  renderLogin(document.getElementById('root'), plantName, { expired: true });
});

async function boot() {
  const rootEl = document.getElementById('root');
  let status = null;
  let failure = '';
  try {
    // Chỉ cần tên nhà máy và người đăng nhập để dựng khung; chờ tối đa vài
    // giây, máy chủ chậm thì báo ngay thay vì quay mãi.
    const [info, st] = await Promise.all([withTimeout(api.info(), 6000), withTimeout(api.authStatus(), 6000)]);
    plantName = info.plant_name;
    setOrg(info.org_name, info.org_unit);
    status = st;
  } catch (err) {
    failure = err.message === 'timeout' ? 'Máy chủ trả lời quá chậm.' : err.message;
  }
  // Giao diện đã dựng xong — báo cho đoạn kiểm tra trong index.html.
  window.__appStarted = true;
  try { sessionStorage.removeItem('huana-boot-retry'); } catch { /* không có sessionStorage */ }

  if (!status) { renderOffline(rootEl, plantName, failure); return; }
  if (status.needs_setup) { renderSetup(rootEl, plantName); return; }
  if (!status.user) { loginShown = true; renderLogin(rootEl, plantName); return; }

  setSession(status);
  buildShell(rootEl, plantName, status.user);
  setFooter('Hệ thống tra cứu tài liệu kỹ thuật, quy trình vận hành và xử lý sự cố');
  start();
  if (status.user.must_change) changePasswordDialog({ forced: true });
}

boot();
