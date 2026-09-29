import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import { can, currentUser } from '../session.js';
import { createStepGrid, importListsInto } from '../stepgrid.js';
import {
  confirmDialog, emptyState, errorState, esc, formatBytes, formatDateTime,
  loading, openModal, qs, qsa, toast,
} from '../ui.js';

// Phiếu thao tác theo cách làm của NKVH điện tử: lập từ phiếu mẫu, đi qua
// Lập → Duyệt → Tiếp nhận → Hoàn thành, vận hành viên tích từng bước ngay trên
// phiếu. Tải về ra đúng tờ phiếu Word của nhà máy để in ký.

const API = '/api/ptt';

export const meta = {
  title: 'Phiếu thao tác',
  subtitle: 'Lập phiếu từ phiếu mẫu, duyệt, tiếp nhận, tích từng bước đã thực hiện',
};

const STATUS_BADGE = {
  moi_lap: 'badge-grey', da_duyet: 'badge-blue', dang_thuc_hien: 'badge-amber',
  hoan_thanh: 'badge-green', huy: 'badge-red',
};

export async function render(root, ctx) {
  const path = window.location.hash.replace(/^#/, '').split('?')[0];
  if (path === '/phieu-thao-tac/moi') return renderNew(root, ctx);
  if (ctx.params.id) return renderTicket(root, Number(ctx.params.id));
  return renderIndex(root, ctx);
}

// ------------------------------------------------------------ tiện ích

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function viTime(v) {
  if (!v) return '';
  const [day, time] = v.replace(' ', 'T').split('T');
  const [y, m, d] = day.split('-');
  return `${(time || '').slice(0, 5)} ${d}/${m}/${y}`.trim();
}

function progress(t) {
  const n = t.n_steps ?? t.steps?.length ?? 0;
  const done = t.n_done ?? t.steps?.filter((s) => s.done).length ?? 0;
  const pct = n ? Math.round((done / n) * 100) : 0;
  return `<div style="min-width:90px"><div class="progress"><span style="width:${pct}%"></span></div>
    <div class="text-muted" style="font-size:11.5px;margin-top:3px">${done}/${n} bước</div></div>`;
}

function operators(t) {
  return (t.people?.thao_tac || []).map((p) => p.name).filter(Boolean).join(', ');
}

let configCache = null;
async function getConfig(force = false) {
  if (!configCache || force) configCache = await api.get(`${API}/cau-hinh`);
  return configCache;
}

// ------------------------------------------------------------ trang tổng

async function renderIndex(root, ctx) {
  const tab = ctx.query.tab === 'ds' ? 'ds' : 'dash';
  setPage({
    ...meta,
    actions: `
      <button class="btn" id="cfg" data-perm="quan_tri">${icon('settings', 16)}Cấu hình số phiếu</button>
      <a class="btn btn-accent" href="#/phieu-thao-tac/moi">${icon('plus', 16)}LẬP PHIẾU</a>`,
  });
  root.innerHTML = `
    <div class="tabs">
      <button class="tab ${tab === 'dash' ? 'active' : ''}" data-tab="">Dashboard</button>
      <button class="tab ${tab === 'ds' ? 'active' : ''}" data-tab="ds">Danh sách phiếu</button>
      <a class="tab" href="#/ptt-mau">Phiếu thao tác mẫu ${icon('chevronRight', 14)}</a>
    </div>
    <div id="tab-body"></div>`;
  qsa('[data-tab]', root).forEach((el) => el.addEventListener('click', () => {
    navigate('/phieu-thao-tac', el.dataset.tab ? { tab: el.dataset.tab } : undefined);
  }));
  qs('#cfg').addEventListener('click', openConfig);
  const body = qs('#tab-body', root);
  if (tab === 'ds') renderList(body, ctx.query);
  else renderDashboard(body, ctx.query.ngay || '');
}

// ------------------------------------------------------------ dashboard ngày

function shiftDay(iso, days) {
  const d = new Date(`${iso}T00:00`);
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function kpi(label, value, tone, note = '') {
  const tones = {
    blue: ['var(--blue-soft)', 'var(--blue)'], green: ['var(--green-soft)', 'var(--green)'],
    amber: ['var(--amber-soft)', 'var(--amber)'], red: ['var(--red-soft)', 'var(--red)'],
    grey: ['#eef2f4', 'var(--muted)'],
  };
  const [bg, fg] = tones[tone];
  return `<div class="stat" style="cursor:default">
      <div class="stat-top"><span class="stat-icon" style="background:${bg};color:${fg}">${icon('forms', 18)}</span>
        <span class="stat-label">${esc(label)}</span></div>
      <div class="stat-value">${value}</div>${note ? `<div class="stat-note">${esc(note)}</div>` : ''}</div>`;
}

function ticketTable(items, { showDate = false } = {}) {
  return `<div style="overflow-x:auto"><table class="table">
    <thead><tr><th>Số phiếu</th><th>Tên phiếu</th><th>Người thao tác</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead>
    <tbody>${items.map((t) => `
      <tr style="${t.status === 'huy' ? 'opacity:.55' : ''}">
        <td><a href="#/phieu-thao-tac/${t.id}" class="mono" style="font-weight:700">${esc(t.code)}</a></td>
        <td>${esc(t.name)}<div class="text-muted" style="font-size:12px">${esc(t.kind_label)}${t.planned_start ? ` · ${esc(viTime(t.planned_start))}` : ''}${showDate ? '' : ''}</div></td>
        <td>${esc(operators(t))}</td>
        <td>${progress(t)}</td>
        <td><span class="badge ${STATUS_BADGE[t.status]}">${esc(t.status_label)}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
}

async function renderDashboard(body, day) {
  body.innerHTML = loading();
  let d;
  try {
    d = await api.get(`${API}/phieu/tong-hop`, { ngay: day });
  } catch (err) {
    body.innerHTML = errorState(err.message);
    return;
  }
  const c = d.counts;
  const running = (c.da_duyet || 0) + (c.dang_thuc_hien || 0);
  body.innerHTML = `
    <div class="toolbar" style="align-items:center">
      <button class="btn btn-sm" data-day="${shiftDay(d.date, -1)}" title="Ngày trước">${icon('chevronLeft', 15)}</button>
      <input class="input" type="date" id="dash-day" value="${d.date}" style="width:auto">
      <button class="btn btn-sm" data-day="${shiftDay(d.date, 1)}" title="Ngày sau">${icon('chevronRight', 15)}</button>
      ${d.is_today ? '<span class="badge badge-green">Hôm nay</span>' : '<button class="btn btn-sm" data-day="">Về hôm nay</button>'}
      <span class="text-muted" style="margin-left:auto;font-size:13px">Tính theo thời gian bắt đầu dự kiến trên phiếu</span>
    </div>
    <div class="grid stat-grid" style="margin-bottom:16px">
      ${kpi('Phiếu trong ngày', c.tong, 'blue', c.huy ? `kể cả ${c.huy} phiếu huỷ` : '')}
      ${kpi('Hoàn thành', c.hoan_thanh || 0, 'green')}
      ${kpi('Đang duyệt / thực hiện', running, running ? 'amber' : 'grey', c.moi_lap ? `${c.moi_lap} phiếu mới lập chưa duyệt` : '')}
      ${kpi('Tồn các ngày trước', d.backlog.length, d.backlog.length ? 'red' : 'grey', 'quá ngày mà chưa hoàn thành')}
    </div>
    ${d.backlog.length ? `
    <section class="card" style="margin-bottom:16px;border-left:4px solid var(--red)">
      <div class="card-head"><h2 class="card-title">Phiếu tồn chưa hoàn thành</h2></div>
      <p class="text-muted" style="margin:0 0 10px;font-size:13px;line-height:1.6">Đã quá ngày thao tác mà phiếu chưa hoàn thành:
        hoặc đã làm xong nhưng chưa đóng phiếu, hoặc thao tác bị dừng giữa chừng. Kiểm tra với kíp trực rồi hoàn thành hoặc huỷ phiếu.</p>
      ${ticketTable(d.backlog, { showDate: true })}
    </section>` : ''}
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Phiếu thao tác ngày ${esc(d.date.split('-').reverse().join('/'))}</h2>
        <div class="card-actions"><a class="btn btn-sm btn-accent" href="#/phieu-thao-tac/moi">${icon('plus', 15)}Lập phiếu</a></div></div>
      ${d.items.length ? ticketTable(d.items) : '<p class="text-muted" style="margin:0">Không có phiếu nào trong ngày này.</p>'}
    </section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <section class="card"><div class="card-head"><h2 class="card-title">Theo người thao tác</h2></div>
        ${d.by_operator.length
          ? `<dl class="kv">${d.by_operator.map(([n, k]) => `<dt style="font-weight:500;color:var(--ink)">${esc(n)}</dt><dd>${k} phiếu</dd>`).join('')}</dl>`
          : '<p class="text-muted" style="margin:0;font-size:13px">Chưa có.</p>'}</section>
      <section class="card"><div class="card-head"><h2 class="card-title">7 ngày gần nhất</h2></div>
        <table class="table"><thead><tr><th>Ngày</th><th style="text-align:right">Phiếu</th><th style="text-align:right">Hoàn thành</th><th style="text-align:right">Huỷ</th></tr></thead>
        <tbody>${d.week.map((w) => `<tr style="${w.date === d.date ? 'background:var(--teal-soft)' : ''}">
          <td><a href="#/phieu-thao-tac?ngay=${w.date}">${esc(w.date.split('-').reverse().join('/').slice(0, 5))}</a></td>
          <td style="text-align:right">${w.lap || '·'}</td><td style="text-align:right">${w.xong || '·'}</td><td style="text-align:right">${w.huy || '·'}</td></tr>`).join('')}</tbody></table></section>
    </div>`;
  const go = (v) => navigate('/phieu-thao-tac', v ? { ngay: v } : undefined);
  qsa('[data-day]', body).forEach((el) => el.addEventListener('click', () => go(el.dataset.day)));
  qs('#dash-day', body).addEventListener('change', (e) => go(e.target.value));
}

// ------------------------------------------------------------ danh sách

async function renderList(body, query) {
  const cfg = await getConfig();
  body.innerHTML = `
    <div class="toolbar">
      <div class="search">${icon('search', 17)}
        <input class="input" id="l-q" placeholder="Tìm số phiếu, tên phiếu, tên người…" value="${esc(query.q || '')}"></div>
      <select class="select" id="l-status"><option value="">Mọi trạng thái</option>
        ${cfg.statuses.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('')}</select>
      <select class="select" id="l-kind"><option value="">Kế hoạch và đột xuất</option>
        ${cfg.kinds.map((k) => `<option value="${k.value}">${esc(k.label)}</option>`).join('')}</select>
      <select class="select" id="l-year"><option value="">Mọi năm</option></select>
    </div>
    <div id="l-list"></div>`;
  const list = qs('#l-list', body);
  const inputs = ['#l-q', '#l-status', '#l-kind', '#l-year'].map((s) => qs(s, body));
  let years = false;
  let timer;
  inputs.forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    clearTimeout(timer); timer = setTimeout(load, el.tagName === 'SELECT' ? 0 : 250);
  }));
  async function load() {
    list.innerHTML = loading();
    try {
      const data = await api.get(`${API}/phieu`, { q: inputs[0].value.trim(), status: inputs[1].value, kind: inputs[2].value, year: inputs[3].value });
      if (!years) { inputs[3].innerHTML += data.years.map((y) => `<option>${y}</option>`).join(''); years = true; }
      list.innerHTML = data.items.length
        ? `<section class="card">${ticketTable(data.items)}</section><div class="text-muted" style="margin-top:12px">${data.total} phiếu</div>`
        : emptyState({ iconName: 'forms', title: 'Chưa có phiếu nào', text: 'Bấm "Lập phiếu", chọn phiếu mẫu rồi điền người viết, người duyệt, người thao tác.' });
    } catch (err) { list.innerHTML = errorState(err.message); }
  }
  load();
}

// ------------------------------------------------------------ cấu hình số phiếu

async function openConfig() {
  const cfg = await getConfig(true);
  const next = cfg.next.ke_hoach;
  openModal({
    title: 'Cấu hình số phiếu',
    wide: true,
    body: `
      <div class="field"><label>Định dạng số phiếu
        <span class="hint">("###" là số thứ tự, "YYYY" là năm, "{PL}" là KH hoặc ĐX theo phân loại phiếu)</span></label>
        <input class="input mono" id="c-format" value="${esc(cfg.number_format)}"></div>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px;font-size:13.5px">
        <input type="checkbox" id="c-shared" ${cfg.shared_sequence ? 'checked' : ''}>
        Phiếu kế hoạch và đột xuất dùng chung một dãy số</label>
      <div class="field"><label>Số tiếp theo năm ${cfg.year}
        <span class="hint">(đặt khi bắt đầu dùng phần mềm giữa năm, để nối tiếp sổ phiếu đang ghi)</span></label>
        <input class="input" type="number" min="1" id="c-next" value="${next.number}" style="max-width:160px"></div>
      <div class="callout" style="margin-bottom:14px">Phiếu kế tiếp: <b class="mono">${esc(cfg.next.ke_hoach.code)}</b> (kế hoạch),
        <b class="mono">${esc(cfg.next.dot_xuat.code)}</b> (đột xuất). Sang năm mới tự đánh lại từ đầu.</div>
      <div class="section-title">Mẫu in phiếu (Word)</div>
      <p style="font-size:13.5px;line-height:1.7;margin:0 0 10px">Đang dùng: <b>${esc(cfg.layout)}</b>.
        Phần mềm điền vào các ô <b>{{…}}</b> của mẫu và dựng lại bảng trình tự theo các bước của phiếu
        (bảng có cột "Nội dung" và "Bước"/"Mục").</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-sm" href="${API}/cau-hinh/mau-in">${icon('download', 15)}Tải mẫu in đang dùng</a>
        <label class="btn btn-sm" style="cursor:pointer">${icon('upload', 15)}Thay mẫu in khác<input type="file" id="c-layout" accept=".docx" hidden></label>
        ${cfg.layout_custom ? `<button class="btn btn-sm" id="c-reset">Về mẫu mặc định</button>` : ''}
      </div>
      <details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px">Các ô dùng được trong mẫu in</summary>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">${cfg.placeholders.map((p) => `<span class="chip" style="cursor:default">{{${esc(p)}}}</span>`).join('')}</div></details>`,
    footer: `<button class="btn" data-close>Đóng</button><button class="btn btn-primary" id="c-save">${icon('check', 15)}Lưu</button>`,
    onMount(m, close) {
      qs('#c-save', m).addEventListener('click', async () => {
        const payload = { number_format: qs('#c-format', m).value, shared_sequence: qs('#c-shared', m).checked };
        const n = Number(qs('#c-next', m).value);
        if (n && n !== next.number) payload.next_number = n;
        try { configCache = await api.put(`${API}/cau-hinh`, payload); close(); toast(`Đã lưu. Phiếu kế tiếp: ${configCache.next.ke_hoach.code}`, 'success'); }
        catch (err) { toast(err.message, 'error', 8000); }
      });
      qs('#c-layout', m).addEventListener('change', async (e) => {
        const form = new FormData(); form.append('file', e.target.files[0]);
        try { configCache = await api.upload(`${API}/cau-hinh/mau-in`, form); close(); toast('Đã thay mẫu in', 'success'); }
        catch (err) { toast(err.message, 'error', 8000); }
      });
      qs('#c-reset', m)?.addEventListener('click', async () => {
        configCache = await api.del(`${API}/cau-hinh/mau-in`); close(); toast('Đã về mẫu in mặc định', 'success');
      });
    },
  });
}

// ------------------------------------------------------------ biểu mẫu thông tin phiếu

function personRow(label, role, i, p, hints, stamp = '') {
  const key = i === null ? role : `${role}.${i}`;
  return `
    <div class="ptt-person">
      <label>${esc(label)}</label>
      <input class="input" data-person="${key}" data-part="name" value="${esc(p?.name || '')}" list="dl-names" placeholder="Họ và tên">
      <span class="text-muted" style="font-size:12.5px;font-weight:600">Chức vụ</span>
      <input class="input" data-person="${key}" data-part="title" value="${esc(p?.title || '')}" list="dl-titles">
      <span class="ptt-stamp">${stamp}</span>
    </div>`;
}

function headerForm(t, hints, cfg, { locked, stamps = {} }) {
  const people = t.people || {};
  const gs = people.giam_sat || [];
  const tt = people.thao_tac || [];
  return `
    <datalist id="dl-names">${hints.names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <datalist id="dl-titles">${hints.titles.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <datalist id="dl-units">${hints.units.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <fieldset ${locked ? 'disabled' : ''} style="border:none;padding:0;margin:0">
    <div class="ptt-grid">
      <label>Số phiếu</label><div><input class="input mono" value="${esc(t.code || 'Cấp tự động khi lưu')}" disabled></div>
      <label>Tên phiếu</label><div><input class="input" name="name" value="${esc(t.name || '')}" required></div>
      <label>Phân loại</label><div style="display:flex;gap:18px;padding:6px 0">
        ${cfg.kinds.map((k) => `<label style="display:flex;gap:6px;align-items:center;font-weight:500">
          <input type="radio" name="kind" value="${k.value}" ${(t.kind || 'ke_hoach') === k.value ? 'checked' : ''}> ${esc(k.label)}</label>`).join('')}</div>
      <label>Đơn vị cấp phiếu</label><div style="padding:6px 0">${esc(t.issuing_unit || cfg.issuing_unit)}</div>
      ${t.status ? `<label>Trạng thái</label><div style="padding:6px 0"><span class="badge ${STATUS_BADGE[t.status]}">${esc(t.status_label)}</span>
        ${t.cancel_reason ? `<span class="text-muted" style="font-size:12.5px"> — ${esc(t.cancel_reason)}</span>` : ''}</div>` : ''}
    </div>
    <div style="margin:10px 0 6px">
      ${personRow('Người viết phiếu', 'viet', null, people.viet, hints, stamps.viet)}
      ${personRow('Người duyệt phiếu', 'duyet', null, people.duyet, hints, stamps.duyet)}
      ${personRow('Người giám sát', 'giam_sat', 0, gs[0], hints, stamps.exec)}
      ${personRow('', 'giam_sat', 1, gs[1], hints)}
      ${personRow('Người thao tác', 'thao_tac', 0, tt[0], hints, stamps.exec)}
      ${personRow('', 'thao_tac', 1, tt[1], hints)}
    </div>
    <div class="field"><label>Mục đích</label><textarea class="textarea" name="purpose" style="min-height:56px">${esc(t.purpose || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Thời gian dự kiến — Bắt đầu</label><input class="input" type="datetime-local" name="planned_start" value="${esc(t.planned_start || '')}"></div>
      <div class="field"><label>Kết thúc</label><input class="input" type="datetime-local" name="planned_end" value="${esc(t.planned_end || '')}"></div>
      <div class="field"><label>Đơn vị đề nghị thao tác</label><input class="input" name="requesting_unit" value="${esc(t.requesting_unit || '')}" list="dl-units"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Điều kiện cần để thực hiện <span class="hint">(mỗi dòng một ý)</span></label>
        <textarea class="textarea" name="conditions" style="min-height:64px">${esc(t.conditions || '')}</textarea></div>
      <div class="field"><label>Lưu ý <span class="hint">(nếu có)</span></label>
        <textarea class="textarea" name="notes" style="min-height:64px">${esc(t.notes || '')}</textarea></div>
    </div>
    </fieldset>`;
}

function collectHeader(root) {
  const form = qs('#ptt-form', root);
  const data = Object.fromEntries(new FormData(form));
  const people = { viet: {}, duyet: {}, giam_sat: [{}, {}], thao_tac: [{}, {}] };
  qsa('[data-person]', root).forEach((el) => {
    const [role, i] = el.dataset.person.split('.');
    const target = i === undefined ? people[role] : people[role][Number(i)];
    target[el.dataset.part] = el.value.trim();
  });
  people.giam_sat = people.giam_sat.filter((p) => p.name || p.title);
  people.thao_tac = people.thao_tac.filter((p) => p.name || p.title);
  return {
    name: (data.name || '').trim(), kind: data.kind || 'ke_hoach', purpose: data.purpose || '',
    planned_start: data.planned_start || '', planned_end: data.planned_end || '',
    requesting_unit: data.requesting_unit || '', conditions: data.conditions || '', notes: data.notes || '', people,
  };
}

// ------------------------------------------------------------ lập phiếu mới

async function renderNew(root, ctx) {
  setPage({
    title: 'Lập phiếu thao tác', subtitle: 'Chọn phiếu mẫu, điền người và thời gian, rồi lưu để cấp số phiếu',
    actions: `<a class="btn btn-sm" href="#/phieu-thao-tac">${icon('chevronLeft', 15)}Quay lại</a>`,
  });
  root.innerHTML = loading();
  let cfg; let hints; let groups;
  try {
    [cfg, hints, groups] = await Promise.all([getConfig(), api.get(`${API}/goi-y`), api.get(`${API}/nhom`)]);
  } catch (err) { root.innerHTML = errorState(err.message); return; }
  if (isStale(root)) return;

  let template = null;
  if (ctx.query.mau) {
    try { template = await api.get(`${API}/mau/${ctx.query.mau}`); } catch { template = null; }
  }
  const me = currentUser();
  const draft = {
    kind: 'ke_hoach', name: template?.name || '', purpose: template?.purpose || '',
    conditions: template?.conditions || '', notes: template?.notes || '',
    planned_start: nowLocal(), issuing_unit: cfg.issuing_unit,
    // Người viết phiếu mặc định là người đang đăng nhập.
    people: me ? { viet: { name: me.full_name, title: me.title || me.role_label } } : {},
  };

  root.innerHTML = `
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Chọn phiếu mẫu</h2></div>
      <div class="field-row">
        <div class="field"><label>Nhóm</label><select class="select" id="n-group">
          <option value="">— Chọn nhóm —</option>
          ${groups.items.map((g) => `<option value="${g.id}" ${template?.group_id === g.id ? 'selected' : ''}>${esc(g.name)} (${g.n_templates})</option>`).join('')}</select></div>
        <div class="field"><label>Phiếu mẫu</label><select class="select" id="n-tpl"><option value="">— Chọn phiếu mẫu —</option></select></div>
      </div>
      <p class="text-muted" style="margin:0;font-size:12.5px">Chọn mẫu sẽ điền sẵn tên phiếu, mục đích, điều kiện và các bước. Không chọn mẫu thì tự nhập các bước bên dưới.</p>
    </section>
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Thông tin phiếu</h2>
        <div class="card-actions"><button class="btn btn-sm" id="copy-last">${icon('copy', 15)}Lấy người từ phiếu gần nhất</button></div></div>
      <form id="ptt-form" onsubmit="return false">${headerForm(draft, hints, cfg, { locked: false })}</form>
    </section>
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Trình tự hạng mục thao tác</h2></div>
      <div id="grid"></div>
    </section>
    <button class="btn btn-primary" id="create">${icon('check', 16)}Lưu và cấp số phiếu</button>`;

  const grid = createStepGrid(qs('#grid', root), template?.steps || [], {
    locations: hints.locations,
    onImport: (data, replace) => importListsInto(qs('#ptt-form', root), data, replace),
  });
  const selGroup = qs('#n-group', root);
  const selTpl = qs('#n-tpl', root);
  async function fillTemplates() {
    selTpl.innerHTML = '<option value="">— Chọn phiếu mẫu —</option>';
    if (!selGroup.value) return;
    const data = await api.get(`${API}/mau`, { nhom: selGroup.value });
    selTpl.innerHTML += data.items.map((t) => `<option value="${t.id}" ${template?.id === t.id ? 'selected' : ''}>${esc(t.name)} (${t.n_steps} bước)</option>`).join('');
  }
  selGroup.addEventListener('change', fillTemplates);
  selTpl.addEventListener('change', async () => {
    if (!selTpl.value) return;
    template = await api.get(`${API}/mau/${selTpl.value}`);
    const form = qs('#ptt-form', root);
    form.elements.name.value = template.name;
    form.elements.purpose.value = template.purpose;
    form.elements.conditions.value = template.conditions;
    form.elements.notes.value = template.notes;
    grid.setSteps(template.steps);
    toast(`Đã lấy ${template.steps.length} bước từ mẫu "${template.name}"`, 'success');
  });
  await fillTemplates();

  qs('#copy-last', root).addEventListener('click', async () => {
    const data = await api.get(`${API}/phieu`);
    const last = data.items.find((t) => t.status !== 'huy');
    if (!last) { toast('Chưa có phiếu nào để lấy lại', 'info'); return; }
    const p = last.people || {};
    const set = (key, part, v) => { const el = qs(`[data-person="${key}"][data-part="${part}"]`, root); if (el && v) el.value = v; };
    [...(me ? [] : [['viet', p.viet]]), ['duyet', p.duyet], ['giam_sat.0', p.giam_sat?.[0]], ['giam_sat.1', p.giam_sat?.[1]],
      ['thao_tac.0', p.thao_tac?.[0]], ['thao_tac.1', p.thao_tac?.[1]]].forEach(([k, v]) => { set(k, 'name', v?.name); set(k, 'title', v?.title); });
    toast(`Đã lấy người từ phiếu ${last.code}. Kiểm tra lại kíp trực.`, 'success');
  });

  qs('#create', root).addEventListener('click', async (e) => {
    const form = qs('#ptt-form', root);
    if (!form.reportValidity()) return;
    const steps = grid.getSteps().filter((s) => s.content.trim() || s.section || s.location);
    if (!steps.length) { toast('Phiếu chưa có bước thao tác nào', 'error'); return; }
    e.currentTarget.disabled = true;
    try {
      const t = await api.post(`${API}/phieu`, { ...collectHeader(root), template_id: template?.id || null, steps });
      toast(`Đã lập phiếu số ${t.code}`, 'success', 6000);
      navigate(`/phieu-thao-tac/${t.id}`);
    } catch (err) { toast(err.message, 'error', 8000); e.currentTarget.disabled = false; }
  });
}

// ------------------------------------------------------------ chi tiết phiếu

async function renderTicket(root, id, { keepScroll = false } = {}) {
  // Làm mới sau một thao tác trên phiếu (duyệt, tiếp nhận, tích bước làm đổi
  // trạng thái…): giữ nguyên nội dung cũ tới khi có nội dung mới và giữ vị trí
  // cuộn, để người đang làm ở giữa bảng 56 bước không bị đẩy lên đầu trang.
  const scrollY = window.scrollY;
  if (!keepScroll) root.innerHTML = loading();
  let t; let cfg; let hints;
  try {
    [t, cfg, hints] = await Promise.all([api.get(`${API}/phieu/${id}`), getConfig(), api.get(`${API}/goi-y`)]);
  } catch (err) { root.innerHTML = errorState(err.message); return; }
  if (isStale(root)) return;

  const editable = t.status === 'moi_lap';
  const running = ['da_duyet', 'dang_thuc_hien'].includes(t.status);
  const closed = ['hoan_thanh', 'huy'].includes(t.status);
  const actions = [];
  if (editable) actions.push(`<button class="btn btn-sm btn-primary" data-act="save">${icon('check', 15)}Lưu</button>`,
    `<button class="btn btn-sm btn-accent" data-act="duyet" data-perm="duyet">${icon('check', 15)}Duyệt phiếu</button>`);
  if (t.status === 'da_duyet') actions.push(`<button class="btn btn-sm btn-accent" data-act="tiep-nhan">${icon('check', 15)}Tiếp nhận phiếu</button>`);
  if (t.status === 'dang_thuc_hien') actions.push(`<button class="btn btn-sm btn-accent" data-act="hoan-thanh">${icon('check', 15)}Hoàn thành phiếu</button>`);
  // Người lập tự huỷ phiếu mới lập của mình; còn lại cần quyền duyệt (Trưởng ca).
  const canCancel = can('duyet') || (t.status === 'moi_lap' && t.created_by_id === currentUser()?.id);
  if (!closed && canCancel) actions.push(`<button class="btn btn-sm btn-danger" data-act="huy">Huỷ phiếu</button>`);

  setPage({
    title: `Phiếu thao tác số ${t.code}`,
    subtitle: t.name,
    actions: `
      <a class="btn btn-sm" href="#/phieu-thao-tac?tab=ds">${icon('chevronLeft', 15)}Quay lại</a>
      <a class="btn btn-sm" href="${API}/phieu/${id}/xem" target="_blank" rel="noopener">${icon('library', 15)}Xem phiếu</a>
      <a class="btn btn-sm" href="${API}/phieu/${id}/word">${icon('download', 15)}Tải Word</a>
      ${actions.join('')}`,
  });

  // Tài khoản đã bấm nút (khác tên người ký gõ trên phiếu) — để truy lại khi cần.
  const stamp = (label, v, by = '') => (v ? `${esc(label)} lúc ${esc(viTime(v))}${by ? ` · tài khoản ${esc(by)}` : ''}` : '');
  const stamps = {
    viet: stamp('Lập phiếu', t.created_at, t.created_by),
    duyet: stamp('Đã duyệt', t.approved_at, t.approved_by),
    exec: [stamp('Tiếp nhận phiếu', t.received_at), stamp('Hoàn thành phiếu', t.completed_at)].filter(Boolean).join('<br>'),
  };
  const done = t.steps.filter((s) => s.done).length;

  root.innerHTML = `
    ${t.status === 'huy' ? `<div class="callout callout-danger" style="margin-bottom:14px">Phiếu đã huỷ${t.cancelled_by ? ` (${esc(t.cancelled_by)})` : ''}${t.cancel_reason ? `: ${esc(t.cancel_reason)}` : ''}.
      Số ${esc(t.code)} giữ nguyên trong sổ, không cấp lại cho phiếu khác.</div>` : ''}
    ${!editable && !closed ? `<div class="callout callout-info" style="margin-bottom:14px">Phiếu đã duyệt: nội dung được giữ nguyên.
      Vận hành viên tích từng bước ngay khi thực hiện xong; ghi sự kiện bất thường ở cuối phiếu.</div>` : ''}
    <section class="card" style="margin-bottom:16px">
      <form id="ptt-form" onsubmit="return false">${headerForm(t, hints, cfg, { locked: !editable, stamps })}</form>
    </section>
    ${handoverCard('before', 'Giao nhận, nghiệm thu đường dây, thiết bị điện trước khi thao tác (nếu có)', t.handover_before, !closed)}
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Trình tự hạng mục thao tác</h2>
        ${editable ? '' : `<div class="card-actions" style="min-width:180px" id="step-progress">${progress({ n_steps: t.steps.length, n_done: done })}</div>`}</div>
      <div id="steps"></div>
    </section>
    ${handoverCard('after', 'Giao nhận, nghiệm thu đường dây, thiết bị điện sau khi thao tác (nếu có)', t.handover_after, !closed)}
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><h2 class="card-title">Các sự kiện bất thường trong thao tác</h2>
        ${closed ? '' : `<div class="card-actions"><button class="btn btn-sm" id="save-abn">${icon('check', 15)}Ghi</button></div>`}</div>
      <textarea class="textarea" id="abnormal" style="min-height:70px" ${closed ? 'disabled' : ''}
        placeholder="Ghi lại mọi điều bất thường khi thao tác: thiết bị không tác động, phải thao tác lại, tín hiệu sai…">${esc(t.abnormal)}</textarea>
    </section>
    <section class="card">
      <div class="card-head"><h2 class="card-title">Tài liệu đính kèm</h2>
        <div class="card-actions"><label class="btn btn-sm" style="cursor:pointer">${icon('upload', 15)}Đính kèm tệp<input type="file" id="attach" hidden></label></div></div>
      ${t.attachments.length ? `<table class="table"><thead><tr><th>Tên file</th><th>Dung lượng</th><th>Thời gian</th><th></th></tr></thead><tbody>
        ${t.attachments.map((a) => `<tr><td><a href="${API}/dinh-kem/${a.id}">${esc(a.filename)}</a></td><td>${esc(formatBytes(a.size_bytes))}</td>
          <td>${esc(formatDateTime(a.created_at))}</td><td style="text-align:right"><button class="btn btn-icon btn-sm btn-danger" data-del-att="${a.id}">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="text-muted" style="margin:0">Chưa có tệp nào (sơ đồ, biên bản…).</p>'}
    </section>`;

  const stepsBox = qs('#steps', root);
  let grid = null;
  if (editable) {
    grid = createStepGrid(stepsBox, t.steps, {
      locations: hints.locations,
      onImport: (data, replace) => importListsInto(qs('#ptt-form', root), data, replace),
    });
  } else {
    renderChecklist(stepsBox, t, running, () => renderTicket(root, id, { keepScroll: true }));
  }

  if (keepScroll) window.scrollTo(0, scrollY);
  const reload = () => renderTicket(root, id, { keepScroll: true });
  bindHandover(root, id);
  document.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    const act = btn.dataset.act;
    try {
      if (act === 'save') {
        if (!qs('#ptt-form', root).reportValidity()) return;
        await api.put(`${API}/phieu/${id}`, { ...collectHeader(root), steps: grid.getSteps() });
        toast('Đã lưu phiếu', 'success');
      } else if (act === 'duyet') {
        if (!(await confirmDialog('Duyệt phiếu? Sau khi duyệt, nội dung phiếu và các bước được giữ nguyên, không sửa được nữa.', { title: 'Duyệt phiếu', danger: false }))) return;
        // Lưu những gì đang sửa trước khi duyệt, để duyệt đúng nội dung trên màn hình.
        await api.put(`${API}/phieu/${id}`, { ...collectHeader(root), steps: grid.getSteps() });
        await api.post(`${API}/phieu/${id}/duyet`, {});
        toast('Đã duyệt phiếu', 'success');
      } else if (act === 'tiep-nhan') {
        await api.post(`${API}/phieu/${id}/tiep-nhan`, {});
        toast('Đã tiếp nhận phiếu. Tích từng bước khi thực hiện xong.', 'success');
      } else if (act === 'hoan-thanh') {
        const left = t.steps.filter((s) => !s.done).length;
        const msg = left ? `Còn ${left} bước chưa tích đã thực hiện. Vẫn hoàn thành phiếu?` : 'Xác nhận hoàn thành phiếu thao tác?';
        if (!(await confirmDialog(msg, { title: 'Hoàn thành phiếu', danger: Boolean(left) }))) return;
        await api.put(`${API}/phieu/${id}`, { abnormal: qs('#abnormal', root).value });
        await api.post(`${API}/phieu/${id}/hoan-thanh`, {});
        toast('Phiếu đã hoàn thành', 'success');
      } else if (act === 'huy') {
        cancelDialog(id, t.code, reload);
        return;
      }
      reload();
    } catch (err) { toast(err.message, 'error', 8000); }
  }));

  qs('#save-abn', root)?.addEventListener('click', async () => {
    try { await api.put(`${API}/phieu/${id}`, { abnormal: qs('#abnormal', root).value }); toast('Đã ghi sự kiện bất thường', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  });
  qs('#attach', root).addEventListener('change', async (e) => {
    const form = new FormData(); form.append('file', e.target.files[0]);
    try { await api.upload(`${API}/phieu/${id}/dinh-kem`, form); reload(); } catch (err) { toast(err.message, 'error'); }
  });
  // Trang làm mới tại chỗ nhiều lần trên cùng phần tử root: chỉ gắn sự kiện
  // một lần, nếu không mỗi lần làm mới lại thêm một hộp xác nhận xoá.
  if (!root.dataset.attBound) {
    root.dataset.attBound = '1';
    root.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del-att]');
      if (!del || !(await confirmDialog('Xoá tệp đính kèm này?', { title: 'Xoá tệp' }))) return;
      await api.del(`${API}/dinh-kem/${del.dataset.delAtt}`);
      renderTicket(root, id, { keepScroll: true });
    });
  }
}

const shortName = (full) => (full || '').trim().split(/\s+/).pop() || '';

// Giờ bắt đầu = lúc tích bước đầu tiên (ghi ở dòng đầu); giờ kết thúc = lúc tích
// bước cuối cùng, chỉ có khi đã tích đủ (ghi ở dòng cuối) — như NKVH.
function stepTimes(steps) {
  const ticks = steps.filter((s) => s.done && s.done_at).map((s) => s.done_at).sort();
  return {
    start: ticks.length ? ticks[0].slice(11, 16) : '',
    end: ticks.length && steps.every((s) => s.done) ? ticks[ticks.length - 1].slice(11, 16) : '',
  };
}

function peopleOptions(list, name) {
  const names = (list || []).map((p) => p.name).filter(Boolean);
  if (!names.length) return '';
  return `<select class="select" id="${name}" style="width:auto;padding:5px 30px 5px 9px">
    ${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>`;
}

function renderChecklist(box, t, running, onChange) {
  let section = '';
  let location = '';
  const times = stepTimes(t.steps);
  const last = t.steps.length - 1;
  const people = t.people || {};
  box.innerHTML = `
    ${running ? `<div class="toolbar" style="margin-bottom:10px;align-items:center;font-size:13px">
      <span class="text-muted">Tích bước sẽ ghi</span>
      <b>Người ra lệnh</b> ${peopleOptions(people.giam_sat, 'cmd-by') || '<span class="text-muted">(chưa khai người giám sát)</span>'}
      <b>Người nhận lệnh</b> ${peopleOptions(people.thao_tac, 'rcv-by') || '<span class="text-muted">(chưa khai người thao tác)</span>'}
    </div>` : ''}
    <div style="overflow-x:auto"><table class="table step-check">
    <thead><tr><th style="width:52px">Mục</th><th style="width:120px">Địa điểm</th><th style="width:48px;text-align:center">Bước</th>
      <th>Nội dung</th><th style="width:78px;text-align:center">Đã thực hiện</th>
      <th style="width:78px;text-align:center">Thời gian bắt đầu</th><th style="width:78px;text-align:center">Thời gian kết thúc</th>
      <th style="width:84px;text-align:center">Người ra lệnh</th><th style="width:84px;text-align:center">Người nhận lệnh</th></tr></thead>
    <tbody>${t.steps.map((s, i) => {
      const showSec = s.section && s.section !== section;
      const showLoc = (s.location && s.location !== location) || showSec;
      section = s.section || section;
      location = s.location || (showSec ? '' : location);
      return `<tr class="${s.done ? 'done' : ''}" data-row="${i}">
        <td style="font-weight:700">${showSec ? esc(s.section) : ''}</td>
        <td>${showLoc ? esc(s.location) : ''}</td>
        <td style="text-align:center;font-weight:700;color:var(--muted)">${i + 1}</td>
        <td class="step-text" style="white-space:pre-wrap;line-height:1.55">${esc(s.content)}</td>
        <td style="text-align:center">
          <input type="checkbox" data-step="${s.id}" data-i="${i}" ${s.done ? 'checked' : ''} ${running ? '' : 'disabled'}
                 title="${s.done_at ? `Tích lúc ${esc(s.done_at.slice(11, 16))} ${esc(s.done_at.slice(8, 10))}/${esc(s.done_at.slice(5, 7))}${s.done_by ? ` — ${esc(s.done_by)}` : ''}` : ''}"
                 style="width:20px;height:20px;cursor:${running ? 'pointer' : 'default'}"></td>
        <td style="text-align:center" ${i === 0 ? 'id="t-start"' : ''}>${i === 0 ? esc(times.start) : ''}</td>
        <td style="text-align:center" ${i === last ? 'id="t-end"' : ''}>${i === last ? esc(times.end) : ''}</td>
        <td style="text-align:center" data-cmd title="${esc(s.commander || '')}">${s.done ? esc(shortName(s.commander)) : ''}</td>
        <td style="text-align:center" data-rcv title="${esc(s.receiver || '')}">${s.done ? esc(shortName(s.receiver)) : ''}</td>
        </tr>`;
    }).join('')}</tbody></table></div>`;

  if (!running) return;
  box.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-step]');
    if (!cb) return;
    const i = Number(cb.dataset.i);
    if (cb.checked && t.steps.slice(0, i).some((s) => !s.done)) {
      // Trình tự thao tác phải đúng thứ tự: nhắc khi tích vượt bước.
      const first = t.steps.findIndex((s) => !s.done) + 1;
      const ok = await confirmDialog(`Bước ${first} trở đi chưa được tích. Thao tác phải theo đúng trình tự — vẫn đánh dấu bước ${i + 1} đã thực hiện?`, { title: 'Tích vượt bước' });
      if (!ok) { cb.checked = false; return; }
    }
    const payload = { done: cb.checked };
    const cmd = qs('#cmd-by', box);
    const rcv = qs('#rcv-by', box);
    if (cmd) payload.commander = cmd.value;
    if (rcv) payload.receiver = rcv.value;
    cb.disabled = true;
    try {
      const updated = await api.put(`${API}/phieu/${t.id}/buoc/${cb.dataset.step}`, payload);
      if (updated.status !== t.status) {
        // Tích bước đầu tiên chuyển phiếu sang "Đang thực hiện": các nút thao
        // tác phía trên đổi theo, nên làm mới cả trang (vẫn giữ chỗ đang cuộn).
        onChange();
        return;
      }
      // Chỉ cập nhật đúng dòng vừa tích, giờ bắt đầu/kết thúc và thanh tiến độ.
      t.steps = updated.steps;
      const step = updated.steps[i];
      const row = cb.closest('tr');
      row.classList.toggle('done', Boolean(step.done));
      row.querySelector('[data-cmd]').textContent = step.done ? shortName(step.commander) : '';
      row.querySelector('[data-rcv]').textContent = step.done ? shortName(step.receiver) : '';
      cb.title = step.done_at ? `Tích lúc ${step.done_at.slice(11, 16)}${step.done_by ? ` — ${step.done_by}` : ''}` : '';
      const tm = stepTimes(updated.steps);
      qs('#t-start', box).textContent = tm.start;
      qs('#t-end', box).textContent = tm.end;
      const bar = document.getElementById('step-progress');
      if (bar) bar.innerHTML = progress({ n_steps: updated.steps.length, n_done: updated.steps.filter((x) => x.done).length });
      cb.disabled = false;
      if (updated.steps.every((x) => x.done)) toast('Đã tích đủ các bước. Bấm "Hoàn thành phiếu" để đóng phiếu.', 'success', 7000);
    } catch (err) {
      toast(err.message, 'error');
      cb.checked = !cb.checked;
      cb.disabled = false;
    }
  });
}

// ------------------------------------------------------------ giao nhận, nghiệm thu

function handoverRow(r = {}, editable = true) {
  if (!editable) {
    return `<tr><td>${esc(r.time)}</td><td>${esc(r.unit)}</td><td>${esc(r.name)}</td><td style="white-space:pre-wrap">${esc(r.content)}</td></tr>`;
  }
  return `<tr>
    <td><input class="input" data-h="time" value="${esc(r.time || '')}" placeholder="HH:MM" style="padding:5px 8px"></td>
    <td><input class="input" data-h="unit" value="${esc(r.unit || '')}" style="padding:5px 8px"></td>
    <td><input class="input" data-h="name" value="${esc(r.name || '')}" list="dl-names" style="padding:5px 8px"></td>
    <td><input class="input" data-h="content" value="${esc(r.content || '')}" style="padding:5px 8px"></td>
    <td style="width:40px"><button class="btn btn-icon btn-sm" data-h-del type="button" title="Xoá dòng">${icon('trash', 14)}</button></td></tr>`;
}

function handoverCard(key, title, rows, editable) {
  const list = rows || [];
  return `
    <section class="card" style="margin-bottom:16px" data-handover="${key}">
      <div class="card-head"><h2 class="card-title" style="font-size:14.5px">${esc(title)}</h2>
        ${editable ? `<div class="card-actions">
          <button class="btn btn-sm" data-h-add type="button">${icon('plus', 14)}Thêm dòng</button>
          <button class="btn btn-sm" data-h-save type="button">${icon('check', 14)}Ghi</button></div>` : ''}</div>
      <div style="overflow-x:auto"><table class="table">
        <thead><tr><th style="width:110px">Thời gian</th><th style="width:22%">Đơn vị</th><th style="width:22%">Họ tên</th><th>Nội dung</th>${editable ? '<th></th>' : ''}</tr></thead>
        <tbody>${list.length ? list.map((r) => handoverRow(r, editable)).join('')
          : editable ? '' : '<tr><td colspan="4" class="text-muted">Không có</td></tr>'}</tbody>
      </table></div>
      ${editable && !list.length ? '<p class="text-muted" data-h-empty style="margin:6px 0 0;font-size:12.5px">Chưa có. Bấm "Thêm dòng" nếu có giao nhận, nghiệm thu.</p>' : ''}
    </section>`;
}

function bindHandover(root, id) {
  qsa('[data-handover]', root).forEach((card) => {
    const key = card.dataset.handover === 'before' ? 'handover_before' : 'handover_after';
    const tbody = qs('tbody', card);
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-h-add]')) {
        tbody.insertAdjacentHTML('beforeend', handoverRow({}));
        qs('[data-h-empty]', card)?.remove();
        tbody.lastElementChild.querySelector('input').focus();
      } else if (e.target.closest('[data-h-del]')) {
        e.target.closest('tr').remove();
      } else if (e.target.closest('[data-h-save]')) {
        const rows = qsa('tr', tbody).map((tr) => Object.fromEntries(
          qsa('[data-h]', tr).map((el) => [el.dataset.h, el.value.trim()]),
        )).filter((r) => Object.values(r).some(Boolean));
        try {
          await api.put(`${API}/phieu/${id}`, { [key]: rows });
          toast(`Đã ghi ${rows.length} dòng giao nhận, nghiệm thu`, 'success');
        } catch (err) { toast(err.message, 'error'); }
      }
    });
  });
}

function cancelDialog(id, code, onDone) {
  openModal({
    title: `Huỷ phiếu ${code}`,
    body: `<div class="field"><label>Lý do huỷ</label><textarea class="textarea" id="reason" style="min-height:70px" placeholder="VD: Lập nhầm, thay đổi phương thức…"></textarea></div>
      <p class="text-muted" style="font-size:12.5px">Số phiếu giữ nguyên trong sổ, không cấp lại.</p>`,
    footer: `<button class="btn" data-close>Không</button><button class="btn btn-danger" id="do-cancel">Huỷ phiếu</button>`,
    onMount(m, close) {
      qs('#do-cancel', m).addEventListener('click', async () => {
        try { await api.post(`${API}/phieu/${id}/huy`, { reason: qs('#reason', m).value }); close(); toast('Đã huỷ phiếu', 'success'); onDone(); }
        catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}
