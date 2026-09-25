import { api } from './api.js';
import * as assistant from './pages/assistant.js';
import * as dashboard from './pages/dashboard.js';
import * as equipment from './pages/equipment.js';
import * as forms from './pages/forms.js';
import * as incidents from './pages/incidents.js';
import { createJournalPage } from './pages/journal.js';
import { createLibraryPage } from './pages/library.js';
import { createProceduresPage } from './pages/procedures.js';
import { setOrg } from './print.js';
import * as tickets from './pages/tickets.js';
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
  ['/phieu-thao-tac', tickets],
  ['/phieu-thao-tac/:id', tickets],
  ['/phieu-thao-tac/lap/:tid', tickets],
  ['/bieu-mau', forms],
  ['/bieu-mau/:id', forms],
  ['/cau-hinh', settings],
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

async function boot() {
  let plantName = 'Nhà máy Thủy điện Hủa Na';
  try {
    const cfg = await api.config();
    plantName = cfg.plant_name;
    setOrg(cfg.org_name, cfg.org_unit);
  } catch {
    // Máy chủ chưa sẵn sàng: vẫn dựng khung để hiển thị lỗi ở từng trang.
  }

  buildShell(document.getElementById('root'), plantName);
  setFooter('Hệ thống tra cứu tài liệu kỹ thuật, quy trình vận hành và xử lý sự cố');
  start();
}

boot();
