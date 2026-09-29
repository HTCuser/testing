import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { currentUser } from '../session.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, errorState, esc, formatBytes, formatDateTime, loading, openModal, qs, toast,
} from '../ui.js';

// Quản trị hệ thống: tài khoản, nhật ký hệ thống, sao lưu, dọn dữ liệu thử.

const API = '/api/quan-tri';
const TABS = [
  ['nguoi-dung', 'Người dùng'],
  ['nhat-ky', 'Nhật ký hệ thống'],
  ['sao-luu', 'Sao lưu'],
  ['don-du-lieu', 'Dọn dữ liệu thử'],
];

export const meta = {
  title: 'Quản trị hệ thống',
  subtitle: 'Tài khoản và phân quyền, nhật ký thao tác, sao lưu dữ liệu',
};

export async function render(root, ctx) {
  const tab = TABS.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : 'nguoi-dung';
  setPage({ ...meta });
  root.innerHTML = `
    <div class="tabs">${TABS.map(([k, label]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
    <div id="tab-body">${loading()}</div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => navigate('/quan-tri', { tab: b.dataset.tab })));
  const body = qs('#tab-body', root);
  const renderers = { 'nguoi-dung': renderUsers, 'nhat-ky': renderAudit, 'sao-luu': renderBackup, 'don-du-lieu': renderCleanup };
  try {
    await renderers[tab](body, ctx);
  } catch (err) {
    if (!isStale(root)) body.innerHTML = errorState(err.message);
  }
}

// ------------------------------------------------------------------ người dùng

async function renderUsers(body) {
  const data = await api.get(`${API}/nguoi-dung`);
  const me = currentUser();
  const roleBadge = { quan_tri: 'badge-violet', truong_ca: 'badge-blue', ky_thuat: 'badge-amber', van_hanh: 'badge-grey' };
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <section class="card">
        <div class="card-head"><h2 class="card-title">Tài khoản (${data.items.length})</h2>
          <div class="card-actions"><button class="btn btn-sm btn-primary" id="u-add">${icon('plus', 15)}Thêm tài khoản</button></div></div>
        <div style="overflow-x:auto"><table class="table">
          <thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Đăng nhập gần nhất</th><th></th></tr></thead>
          <tbody>${data.items.map((u) => `
            <tr style="${u.active ? '' : 'opacity:.55'}">
              <td><b>${esc(u.full_name)}</b>${u.title ? `<div class="text-muted" style="font-size:12.5px">${esc(u.title)}</div>` : ''}</td>
              <td class="mono">${esc(u.username)}${u.id === me?.id ? ' <span class="badge badge-green">bạn</span>' : ''}</td>
              <td><span class="badge ${roleBadge[u.role] || 'badge-grey'}">${esc(u.role_label)}</span>
                ${u.active ? '' : ' <span class="badge badge-red">Đã khoá</span>'}
                ${u.must_change ? '<div class="text-muted" style="font-size:12px">Chưa đổi mật khẩu lần đầu</div>' : ''}</td>
              <td>${u.last_login ? esc(formatDateTime(u.last_login)) : '<span class="text-muted">Chưa</span>'}</td>
              <td style="text-align:right;white-space:nowrap">
                <button class="btn btn-sm" data-edit="${u.id}">${icon('edit', 14)}Sửa</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="card" style="max-width:860px">
        <div class="card-head"><h2 class="card-title">Quyền theo vai trò</h2></div>
        <p class="text-muted" style="margin:0 0 12px;font-size:13px;line-height:1.6">Mọi tài khoản đều tra cứu, hỏi trợ lý,
          lập phiếu, tích bước, ghi nhật ký. Quyền cộng thêm:</p>
        <table class="table" style="font-size:12.5px">
          <thead><tr><th></th>${Object.values(data.roles).map((r) => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr></thead>
          <tbody>${Object.entries(data.perm_labels).map(([p, label]) => `<tr><td>${esc(label)}</td>
            ${Object.keys(data.roles).map((r) => `<td style="text-align:center">${data.role_perms[r].includes(p) ? '<b style="color:var(--green)">✓</b>' : '<span class="text-muted">—</span>'}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <p class="text-muted" style="margin:12px 0 0;font-size:12.5px;line-height:1.6">Người lập phiếu tự huỷ được phiếu
          <i>mới lập</i> của mình. Nhật ký nghiệp vụ: người ghi, Trưởng ca, Quản trị được sửa, xoá.</p>
      </section>
    </div>`;

  const reload = () => renderUsers(body);
  qs('#u-add', body).addEventListener('click', () => userDialog(null, data.roles, reload));
  body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    userDialog(data.items.find((u) => u.id === Number(b.dataset.edit)), data.roles, reload);
  }));
}

function userDialog(user, roles, onDone) {
  const isNew = !user;
  const me = currentUser();
  openModal({
    title: isNew ? 'Thêm tài khoản' : `Tài khoản ${user.username}`,
    body: `
      <form id="u-form" onsubmit="return false">
        <div class="field-row">
          <div class="field"><label>Họ tên</label><input class="input" name="full_name" value="${esc(user?.full_name || '')}" required></div>
          <div class="field"><label>Chức danh <span class="hint">(in trên phiếu)</span></label>
            <input class="input" name="title" value="${esc(user?.title || '')}" placeholder="VD: Trưởng ca, VHV gian máy"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Tên đăng nhập</label><input class="input" name="username" value="${esc(user?.username || '')}"
            ${isNew ? 'required autocapitalize="none" placeholder="VD: annv"' : 'disabled'}></div>
          <div class="field"><label>Vai trò</label><select class="select" name="role">
            ${Object.entries(roles).map(([k, v]) => `<option value="${k}" ${(user?.role || 'van_hanh') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>${isNew ? 'Mật khẩu ban đầu' : 'Đặt lại mật khẩu'} <span class="hint">(ít nhất 6 ký tự${isNew ? '' : '; để trống nếu không đổi'};
          người dùng phải đổi ở lần đăng nhập tới)</span></label>
          <input class="input" name="password" type="text" autocomplete="off" ${isNew ? 'required' : ''}></div>
        ${isNew ? '' : `<label style="display:flex;gap:8px;align-items:center;margin-top:4px">
          <input type="checkbox" name="active" ${user.active ? 'checked' : ''} ${user.id === me?.id ? 'disabled' : ''}> Tài khoản đang được dùng
          <span class="hint">(bỏ tích để khoá — người đó bị đăng xuất ngay)</span></label>`}
      </form>`,
    footer: `${isNew || user.id === me?.id ? '' : `<button class="btn btn-danger" id="u-del">${icon('trash', 15)}Xoá</button>`}
      <button class="btn" data-close style="margin-left:auto">Huỷ</button>
      <button class="btn btn-primary" id="u-save">${icon('check', 15)}Lưu</button>`,
    onMount(m, close) {
      qs('#u-save', m).addEventListener('click', async () => {
        const form = qs('#u-form', m);
        if (!form.reportValidity()) return;
        const d = Object.fromEntries(new FormData(form));
        try {
          if (isNew) {
            await api.post(`${API}/nguoi-dung`, { username: d.username, full_name: d.full_name, title: d.title, role: d.role, password: d.password });
            toast(`Đã tạo tài khoản ${d.username}. Báo mật khẩu ban đầu cho người dùng.`, 'success', 6000);
          } else {
            const payload = { full_name: d.full_name, title: d.title, role: d.role };
            if (user.id !== me?.id) payload.active = Boolean(form.elements.active?.checked);
            if (d.password) payload.password = d.password;
            await api.put(`${API}/nguoi-dung/${user.id}`, payload);
            toast('Đã lưu', 'success');
          }
          close();
          onDone();
        } catch (err) { toast(err.message, 'error', 7000); }
      });
      qs('#u-del', m)?.addEventListener('click', async () => {
        close();
        if (!(await confirmDialog(`Xoá hẳn tài khoản ${user.username}? Nhật ký hệ thống vẫn giữ tên người này. `
          + 'Nếu chỉ tạm ngừng (nghỉ, chuyển bộ phận) thì nên khoá thay vì xoá.', { title: 'Xoá tài khoản' }))) return;
        try { await api.del(`${API}/nguoi-dung/${user.id}`); toast('Đã xoá tài khoản', 'success'); onDone(); } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ------------------------------------------------------------------ nhật ký hệ thống

async function renderAudit(body, ctx) {
  const f = { q: ctx.query.q || '', nguoi: ctx.query.nguoi || '', tu: ctx.query.tu || '', den: ctx.query.den || '', trang: Number(ctx.query.trang) || 1 };
  const data = await api.get(`${API}/nhat-ky`, f);
  const pages = Math.max(1, Math.ceil(data.total / data.per_page));
  body.innerHTML = `
    <section class="card">
      <form class="toolbar" id="a-filter" style="margin-bottom:14px;flex-wrap:wrap;gap:8px" onsubmit="return false">
        <input class="input" name="q" value="${esc(f.q)}" placeholder="Tìm hành động, số phiếu, tên người…" style="flex:1 1 240px">
        <select class="select" name="nguoi" style="width:auto"><option value="">Mọi người</option>
          ${data.users.map((u) => `<option ${u === f.nguoi ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
        <label class="text-muted" style="font-size:13px">Từ <input class="input" type="date" name="tu" value="${esc(f.tu)}" style="width:auto"></label>
        <label class="text-muted" style="font-size:13px">đến <input class="input" type="date" name="den" value="${esc(f.den)}" style="width:auto"></label>
        <button class="btn btn-primary btn-sm" type="submit">${icon('search', 15)}Lọc</button>
      </form>
      <div class="text-muted" style="margin-bottom:8px;font-size:13px">${data.total.toLocaleString('vi-VN')} dòng</div>
      <div style="overflow-x:auto"><table class="table">
        <thead><tr><th style="width:150px">Thời gian</th><th>Người</th><th>Hành động</th><th>Đối tượng</th><th>Máy</th></tr></thead>
        <tbody>${data.items.length ? data.items.map((it) => `<tr>
          <td>${esc(formatDateTime(it.created_at))}</td>
          <td>${esc(it.full_name || it.username || '—')}${it.full_name ? `<div class="text-muted mono" style="font-size:12px">${esc(it.username)}</div>` : ''}</td>
          <td ${it.status >= 400 ? 'style="color:var(--red)"' : ''}>${esc(it.action)}</td>
          <td>${esc(it.target)}</td>
          <td class="mono text-muted" style="font-size:12px">${esc(it.ip)}</td></tr>`).join('')
          : '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:18px">Không có dòng nào.</td></tr>'}</tbody>
      </table></div>
      ${pages > 1 ? `<div class="toolbar" style="justify-content:center;margin-top:12px;gap:8px">
        <button class="btn btn-sm" data-page="${f.trang - 1}" ${f.trang <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 14)}Trước</button>
        <span class="text-muted" style="font-size:13px">Trang ${f.trang}/${pages}</span>
        <button class="btn btn-sm" data-page="${f.trang + 1}" ${f.trang >= pages ? 'disabled' : ''}>Sau${icon('chevronRight', 14)}</button></div>` : ''}
    </section>`;
  const form = qs('#a-filter', body);
  const go = (trang) => navigate('/quan-tri', { tab: 'nhat-ky', ...Object.fromEntries(new FormData(form)), trang });
  form.addEventListener('submit', () => go(1));
  body.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.page))));
}

// ------------------------------------------------------------------ sao lưu

async function renderBackup(body) {
  const s = await api.get(`${API}/sao-luu`);
  const last = s.items[0];
  body.innerHTML = `
    <div class="grid two-col">
      <section class="card">
        <div class="card-head"><h2 class="card-title">Sao lưu dữ liệu</h2>
          <div class="card-actions"><button class="btn btn-sm btn-primary" id="b-now">${icon('database', 15)}Sao lưu ngay</button></div></div>
        <dl class="kv" style="grid-template-columns:170px 1fr">
          <dt>Thư mục sao lưu</dt><dd class="mono">${esc(s.folder)}</dd>
          <dt>Lần gần nhất</dt><dd>${last ? esc(formatDateTime(last.time)) : '<span style="color:var(--red)">Chưa sao lưu lần nào</span>'}</dd>
          <dt>Giữ bản chụp CSDL</dt><dd>${s.keep_days} ngày (luôn giữ ít nhất 7 bản gần nhất)</dd>
          <dt>Tệp tài liệu đã chép</dt><dd>${esc(formatBytes(s.files_bytes))}</dd>
        </dl>
        ${s.same_drive ? `<div class="callout callout-danger" style="margin-top:14px">Thư mục sao lưu đang nằm <b>cùng ổ đĩa</b> với phần mềm:
          hỏng ổ là mất cả hai. Đặt <code>SAO_LUU_DIR=D:\\SaoLuu-HuaNa</code> (ổ khác, hoặc ổ cứng gắn ngoài) trong file .env rồi khởi động lại phần mềm.</div>` : ''}
        <div class="callout callout-info" style="margin-top:14px;line-height:1.7">
          Máy chủ cài bằng <b>cai-dat-may-chu.bat</b> tự sao lưu lúc 11:50 và 23:50 hằng ngày.
          Mỗi lần sao lưu chụp lại toàn bộ CSDL (phiếu, nhật ký, tài khoản, chỉ mục) và chép thêm các tệp mới tải lên.<br>
          <b>Khôi phục:</b> dừng phần mềm (dung-may-chu.bat) rồi chạy <b>khoi-phuc.bat</b> trên máy chủ, chọn bản cần khôi phục.
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Các bản sao lưu (${s.items.length})</h2></div>
        ${s.items.length ? `<div style="max-height:460px;overflow-y:auto"><table class="table">
          <thead><tr><th>Thời điểm</th><th>Thư mục</th><th style="text-align:right">CSDL</th></tr></thead>
          <tbody>${s.items.map((it) => `<tr><td>${esc(formatDateTime(it.time))}</td><td class="mono">${esc(it.name)}</td>
            <td style="text-align:right">${esc(formatBytes(it.size_bytes))}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="text-muted" style="margin:0">Chưa có bản nào. Bấm "Sao lưu ngay".</p>'}
      </section>
    </div>`;
  qs('#b-now', body).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Đang sao lưu…';
    try {
      const r = await api.post(`${API}/sao-luu`, {});
      toast(`Đã sao lưu: ${r.name} (chép ${r.files_copied} tệp mới, ${r.seconds} giây)`, 'success', 6000);
      renderBackup(body);
    } catch (err) {
      toast(err.message, 'error', 8000);
      btn.disabled = false;
      btn.textContent = 'Sao lưu ngay';
    }
  });
}

// ------------------------------------------------------------------ dọn dữ liệu thử

const CLEAN_ITEMS = [
  ['phieu_thao_tac', 'Phiếu thao tác đã lập', 'Xoá mọi phiếu (kể cả đã hoàn thành) và tệp đính kèm; số phiếu đếm lại từ đầu. Phiếu thao tác mẫu được giữ nguyên.'],
  ['nhat_ky', 'Nhật ký Thao tác vận hành, Bảo dưỡng sửa chữa', 'Xoá mọi bản ghi nhật ký nghiệp vụ.'],
  ['lich_su_hoi', 'Lịch sử hỏi trợ lý', 'Xoá các câu đã hỏi và câu trả lời.'],
  ['du_lieu_mau', 'Dữ liệu mẫu minh hoạ', 'Gỡ quy trình, hồ sơ sự cố, biểu mẫu, thiết bị mẫu do phần mềm tạo sẵn. Tài liệu nhà máy tải lên không bị đụng.'],
  ['nhat_ky_he_thong', 'Nhật ký hệ thống', 'Xoá lịch sử đăng nhập, thao tác trong giai đoạn thử.'],
];

async function renderCleanup(body) {
  const counts = await api.get(`${API}/don-du-lieu`);
  body.innerHTML = `
    <section class="card" style="max-width:860px">
      <div class="card-head"><h2 class="card-title">Dọn dữ liệu nhập thử trước khi dùng chính thức</h2></div>
      <div class="callout" style="margin-bottom:16px;line-height:1.7">Phần mềm <b>tự sao lưu trước khi xoá</b>, nên nếu xoá nhầm vẫn khôi phục được
        (khoi-phuc.bat). Tài liệu thư viện, phiếu thao tác mẫu, tài khoản người dùng và cấu hình <b>không bị xoá</b>.</div>
      <form id="c-form" onsubmit="return false">
        ${CLEAN_ITEMS.map(([k, label, hint]) => `
          <label class="clean-item">
            <input type="checkbox" name="${k}" ${counts[k] ? '' : 'disabled'}>
            <span><b>${label}</b> <span class="badge ${counts[k] ? 'badge-amber' : 'badge-grey'}">${counts[k].toLocaleString('vi-VN')}</span>
              <span class="text-muted" style="display:block;font-size:12.5px;margin-top:2px">${hint}</span></span>
          </label>`).join('')}
        <div class="field" style="margin-top:16px;max-width:360px"><label>Gõ <b>XOA</b> để xác nhận</label>
          <input class="input" name="xac_nhan" autocomplete="off"></div>
        <button class="btn btn-danger" id="c-run">${icon('trash', 15)}Sao lưu rồi xoá các mục đã chọn</button>
      </form>
      <p class="text-muted" style="margin:14px 0 0;font-size:12.5px;line-height:1.6">Muốn số phiếu năm nay bắt đầu từ một số
        khác 1: sau khi dọn, vào Phiếu thao tác → Cấu hình số phiếu → Số tiếp theo.</p>
    </section>`;
  qs('#c-run', body).addEventListener('click', async () => {
    const form = qs('#c-form', body);
    const payload = { xac_nhan: form.elements.xac_nhan.value };
    CLEAN_ITEMS.forEach(([k]) => { payload[k] = form.elements[k].checked; });
    const chosen = CLEAN_ITEMS.filter(([k]) => payload[k]).map(([, label]) => label);
    if (!chosen.length) { toast('Chọn ít nhất một mục', 'info'); return; }
    if (!(await confirmDialog(`Xoá: ${chosen.join('; ')}?`, { title: 'Dọn dữ liệu thử' }))) return;
    try {
      const r = await api.post(`${API}/don-du-lieu`, payload);
      toast(`Đã dọn xong. Bản sao lưu trước khi xoá: ${r.backup}`, 'success', 8000);
      renderCleanup(body);
    } catch (err) { toast(err.message, 'error', 8000); }
  });
}
