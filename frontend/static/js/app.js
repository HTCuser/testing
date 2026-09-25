import { api } from './api.js';
import * as assistant from './pages/assistant.js';
import * as dashboard from './pages/dashboard.js';
import * as equipment from './pages/equipment.js';
import * as forms from './pages/forms.js';
import * as incidents from './pages/incidents.js';
import * as library from './pages/library.js';
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

const PAGES = [
  ['/', dashboard],
  ['/tro-ly', assistant],
  ['/thu-vien', library],
  ['/thu-vien/:id', library],
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
