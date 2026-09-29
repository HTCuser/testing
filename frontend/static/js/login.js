import { api } from './api.js';
import { icon } from './icons.js';
import { esc, openModal, qs, toast } from './ui.js';

// Màn hình đăng nhập, tạo tài khoản quản trị lần đầu, đổi mật khẩu.

function frame(plantName, inner) {
  return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark">${icon('droplet', 21)}</div>
          <div>
            <div class="login-name">HUANA<span style="color:#f5821f">+</span> Trợ lý kỹ thuật</div>
            <div class="text-muted" style="font-size:13px">${esc(plantName)}</div>
          </div>
        </div>
        ${inner}
      </div>
    </div>`;
}

export function renderLogin(rootEl, plantName, { expired = false } = {}) {
  rootEl.innerHTML = frame(plantName, `
    <h1 class="login-title">Đăng nhập</h1>
    ${expired ? '<div class="callout" style="margin-bottom:14px">Phiên làm việc đã hết hạn. Đăng nhập lại để tiếp tục.</div>' : ''}
    <form id="login-form" autocomplete="on">
      <div class="field"><label>Tên đăng nhập</label>
        <input class="input" name="username" autocomplete="username" autocapitalize="none" required autofocus></div>
      <div class="field"><label>Mật khẩu</label>
        <input class="input" name="password" type="password" autocomplete="current-password" required></div>
      <div class="login-error" id="login-error" hidden></div>
      <button class="btn btn-primary login-btn" type="submit">${icon('check', 16)}Đăng nhập</button>
    </form>
    <p class="text-muted login-hint">Quên mật khẩu: nhờ quản trị hệ thống đặt lại.<br>
      Máy dùng chung cho cả kíp: đăng xuất khi hết ca (bấm vào tên mình ở góc dưới bên trái).</p>`);
  const form = qs('#login-form', rootEl);
  qs('[name=username]', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('button[type=submit]', form);
    const errBox = qs('#login-error', form);
    btn.disabled = true;
    errBox.hidden = true;
    try {
      await api.login(Object.fromEntries(new FormData(form)));
      // Nạp lại trang để mọi phần dựng theo quyền của người vừa đăng nhập.
      window.location.reload();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      btn.disabled = false;
      qs('[name=password]', form).select();
    }
  });
}

export function renderSetup(rootEl, plantName) {
  rootEl.innerHTML = frame(plantName, `
    <h1 class="login-title">Tạo tài khoản quản trị</h1>
    <p style="margin:0 0 16px;line-height:1.65">Phần mềm chưa có tài khoản nào. Tạo tài khoản <b>Quản trị hệ thống</b>
      đầu tiên; sau đó vào mục <b>Quản trị</b> để thêm tài khoản cho từng vận hành viên, trưởng ca, kỹ thuật viên.</p>
    <form id="setup-form">
      <div class="field-row">
        <div class="field"><label>Họ tên</label><input class="input" name="full_name" required placeholder="VD: Hà Duy Tuấn"></div>
        <div class="field"><label>Chức danh</label><input class="input" name="title" placeholder="VD: Kỹ sư vận hành"></div>
      </div>
      <div class="field"><label>Tên đăng nhập <span class="hint">(chữ không dấu, không cách)</span></label>
        <input class="input" name="username" required autocapitalize="none" placeholder="VD: tuanhd"></div>
      <div class="field-row">
        <div class="field"><label>Mật khẩu <span class="hint">(ít nhất 6 ký tự)</span></label>
          <input class="input" name="password" type="password" autocomplete="new-password" required></div>
        <div class="field"><label>Nhập lại mật khẩu</label>
          <input class="input" name="password2" type="password" autocomplete="new-password" required></div>
      </div>
      <div class="login-error" id="login-error" hidden></div>
      <button class="btn btn-primary login-btn" type="submit">${icon('check', 16)}Tạo tài khoản và vào phần mềm</button>
    </form>`);
  const form = qs('#setup-form', rootEl);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errBox = qs('#login-error', form);
    if (data.password !== data.password2) {
      errBox.textContent = 'Hai lần nhập mật khẩu không khớp';
      errBox.hidden = false;
      return;
    }
    try {
      await api.setup({ username: data.username, full_name: data.full_name, title: data.title, password: data.password });
      window.location.reload();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });
}

export function renderOffline(rootEl, plantName, message) {
  rootEl.innerHTML = frame(plantName, `
    <h1 class="login-title">Không kết nối được máy chủ</h1>
    <p style="line-height:1.65">${esc(message || 'Máy chủ không trả lời.')} Kiểm tra máy chủ phần mềm còn chạy không,
      rồi bấm Thử lại.</p>
    <button class="btn btn-primary login-btn" id="retry">${icon('refresh', 16)}Thử lại</button>`);
  qs('#retry', rootEl).addEventListener('click', () => window.location.reload());
}

export function changePasswordDialog({ forced = false } = {}) {
  let changed = false;
  const { overlay } = openModal({
    title: forced ? 'Đổi mật khẩu trước khi dùng' : 'Đổi mật khẩu',
    body: `
      ${forced ? '<div class="callout" style="margin-bottom:14px">Mật khẩu này do quản trị đặt. Hãy đổi sang mật khẩu của riêng bạn.</div>' : ''}
      <form id="pw-form" onsubmit="return false">
        <div class="field"><label>Mật khẩu hiện tại</label>
          <input class="input" name="old_password" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>Mật khẩu mới <span class="hint">(ít nhất 6 ký tự)</span></label>
          <input class="input" name="new_password" type="password" autocomplete="new-password" required></div>
        <div class="field"><label>Nhập lại mật khẩu mới</label>
          <input class="input" name="new_password2" type="password" autocomplete="new-password" required></div>
      </form>`,
    footer: `${forced ? '' : '<button class="btn" data-close>Huỷ</button>'}
      <button class="btn btn-primary" id="pw-save">${icon('check', 15)}Đổi mật khẩu</button>`,
    onMount(m, close) {
      if (forced) m.querySelector('.modal-head [data-close]')?.remove();
      qs('[name=old_password]', m).focus();
      qs('#pw-save', m).addEventListener('click', async () => {
        const form = qs('#pw-form', m);
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        if (data.new_password !== data.new_password2) { toast('Hai lần nhập mật khẩu mới không khớp', 'error'); return; }
        try {
          await api.changePassword({ old_password: data.old_password, new_password: data.new_password });
          changed = true;
          toast('Đã đổi mật khẩu', 'success');
          close();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
  if (forced) {
    // Bắt buộc: bấm Esc hay bấm ra ngoài làm hộp thoại đóng thì mở lại ngay.
    new MutationObserver((_, obs) => {
      if (document.body.contains(overlay)) return;
      obs.disconnect();
      if (!changed) changePasswordDialog({ forced: true });
    }).observe(document.body, { childList: true });
  }
}
