import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, formatDateTime,
  loading, openModal, qs, qsa, toast,
} from '../ui.js';

// Phiếu thao tác lập từ mẫu Word của nhà máy. Mẫu giữ nguyên hình thức phiếu
// thật; phần mềm chỉ lo phần thay đổi theo từng lần lập: số phiếu, ngày giờ,
// người viết, người duyệt, người thao tác...

export const meta = {
  title: 'Phiếu thao tác',
  subtitle: 'Lập phiếu từ mẫu Word của nhà máy, số phiếu tự tăng, quản lý phiếu đã lập',
};

const BASE = '/api/phieu';
const DATE_KEY = '_ngay';

const STATUS_BADGE = { da_lap: 'badge-blue', da_thuc_hien: 'badge-green', huy: 'badge-red' };

export async function render(root, ctx) {
  if (ctx.params.tid) return renderNew(root, Number(ctx.params.tid));
  if (ctx.params.id) return renderTicket(root, Number(ctx.params.id));
  return renderIndex(root, ctx);
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function viDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
}

// ------------------------------------------------------------ trang tổng

async function renderIndex(root, ctx) {
  const tab = ['mau', 'phieu'].includes(ctx.query.tab) ? ctx.query.tab : 'tong-hop';
  setPage({
    ...meta,
    actions: `
      <button class="btn" id="upload-tpl">${icon('upload', 16)}Tải mẫu phiếu</button>
      <button class="btn btn-accent" id="new-ticket">${icon('plus', 16)}LẬP PHIẾU MỚI</button>`,
  });
  root.innerHTML = loading();

  let templates;
  try {
    templates = await api.get(`${BASE}/mau`);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  root.innerHTML = `
    <div class="tabs">
      <button class="tab ${tab === 'tong-hop' ? 'active' : ''}" data-tab="">Dashboard</button>
      <button class="tab ${tab === 'phieu' ? 'active' : ''}" data-tab="phieu">Phiếu đã lập</button>
      <button class="tab ${tab === 'mau' ? 'active' : ''}" data-tab="mau">
        PTT mẫu <span class="badge badge-grey">${templates.items.length}</span></button>
    </div>
    <div id="tab-body"></div>`;

  qsa('[data-tab]', root).forEach((el) => el.addEventListener('click', () => {
    navigate('/phieu-thao-tac', el.dataset.tab ? { tab: el.dataset.tab } : undefined);
  }));
  qs('#upload-tpl').addEventListener('click', () => openUpload(templates.categories, (item) => {
    toast(`Đã thêm mẫu "${item.name}" với ${item.fields.length} ô cần điền`, 'success');
    navigate('/phieu-thao-tac', { tab: 'mau' });
  }));
  qs('#new-ticket').addEventListener('click', () => pickTemplate(templates));

  const body = qs('#tab-body', root);
  if (tab === 'mau') renderTemplates(body, templates);
  else if (tab === 'phieu') renderTickets(body, templates, ctx.query);
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
  return `
    <div class="stat" style="cursor:default">
      <div class="stat-top"><span class="stat-icon" style="background:${bg};color:${fg}">${icon('forms', 18)}</span>
        <span class="stat-label">${esc(label)}</span></div>
      <div class="stat-value">${value}</div>
      ${note ? `<div class="stat-note">${esc(note)}</div>` : ''}
    </div>`;
}

function dashRow(t, { showDate = false } = {}) {
  const who = Object.entries(t.values).find(([k]) => /^người thao tác$/i.test(k.trim()))?.[1] || '';
  return `
    <tr style="${t.status === 'huy' ? 'opacity:.55' : ''}">
      <td><a href="#/phieu-thao-tac/${t.id}" class="mono" style="font-weight:700">${esc(t.code)}</a></td>
      <td>${esc(t.template_name)}${showDate ? `<div class="text-muted" style="font-size:12px">${esc(viDate(t.ticket_date))}</div>` : ''}</td>
      <td>${esc(who)}</td>
      <td><span class="badge ${STATUS_BADGE[t.status] || 'badge-grey'}">${esc(t.status_label)}</span></td>
      <td style="text-align:right;white-space:nowrap">
        ${t.status === 'da_lap' ? `<button class="btn btn-sm btn-primary" data-done="${t.id}" title="Xác nhận phiếu đã thực hiện xong">${icon('check', 14)}Đã thực hiện</button>` : ''}
        <a class="btn btn-sm" href="${BASE}/${t.id}/xem" target="_blank" rel="noopener" title="Xem phiếu">${icon('library', 14)}</a>
      </td>
    </tr>`;
}

function ticketTable(items, opts) {
  return `
    <div style="overflow-x:auto"><table class="table">
      <thead><tr><th>Số phiếu</th><th>Phiếu</th><th>Người thao tác</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${items.map((t) => dashRow(t, opts)).join('')}</tbody>
    </table></div>`;
}

async function renderDashboard(body, day) {
  body.innerHTML = loading();
  let d;
  try {
    d = await api.get(`${BASE}/tong-hop`, { ngay: day });
  } catch (err) {
    body.innerHTML = errorState(err.message);
    return;
  }
  const c = d.counts;
  const open = c.da_lap || 0;
  body.innerHTML = `
    <div class="toolbar" style="align-items:center">
      <button class="btn btn-sm" data-day="${shiftDay(d.date, -1)}" title="Ngày trước">${icon('chevronLeft', 15)}</button>
      <input class="input" type="date" id="dash-day" value="${d.date}" style="width:auto">
      <button class="btn btn-sm" data-day="${shiftDay(d.date, 1)}" title="Ngày sau">${icon('chevronRight', 15)}</button>
      ${d.is_today ? '<span class="badge badge-green">Hôm nay</span>' : '<button class="btn btn-sm" data-day="">Về hôm nay</button>'}
      <span class="text-muted" style="margin-left:auto;font-size:13px">Phiếu tính theo ngày thao tác ghi trên phiếu</span>
    </div>

    <div class="grid stat-grid" style="margin-bottom:16px">
      ${kpi('Phiếu trong ngày', c.tong, 'blue', c.huy ? `kể cả ${c.huy} phiếu huỷ` : '')}
      ${kpi('Đã thực hiện', c.da_thuc_hien || 0, 'green')}
      ${kpi('Chưa xác nhận thực hiện', open, open ? 'amber' : 'grey')}
      ${kpi('Tồn các ngày trước', d.backlog.length, d.backlog.length ? 'red' : 'grey', 'phiếu "Đã lập" quá ngày thao tác')}
    </div>

    ${d.backlog.length ? `
    <section class="card" style="margin-bottom:16px;border-left:4px solid var(--red)">
      <div class="card-head"><h2 class="card-title">Phiếu tồn chưa xác nhận thực hiện</h2></div>
      <p class="text-muted" style="margin:0 0 10px;font-size:13px;line-height:1.6">
        Đã quá ngày thao tác mà phiếu vẫn ở trạng thái "Đã lập": hoặc đã thao tác xong nhưng chưa đóng phiếu,
        hoặc thao tác bị dừng giữa chừng. Kiểm tra với kíp trực rồi xác nhận thực hiện hoặc huỷ phiếu.</p>
      ${ticketTable(d.backlog, { showDate: true })}
    </section>` : ''}

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h2 class="card-title">Phiếu thao tác ngày ${esc(viDate(d.date))}</h2>
        <div class="card-actions"><button class="btn btn-sm btn-accent" id="dash-new">${icon('plus', 15)}Lập phiếu</button></div>
      </div>
      ${d.items.length ? ticketTable(d.items) : `<p class="text-muted" style="margin:0">Không có phiếu nào trong ngày này.</p>`}
    </section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Theo người thao tác</h2></div>
          ${d.by_operator.length
            ? `<dl class="kv">${d.by_operator.map(([name, n]) => `<dt style="font-weight:500;color:var(--ink)">${esc(name)}</dt><dd>${n} phiếu</dd>`).join('')}</dl>`
            : '<p class="text-muted" style="margin:0;font-size:13px">Chưa có (lấy theo ô {{Người thao tác}} của mẫu).</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h2 class="card-title">7 ngày gần nhất</h2></div>
          <table class="table">
            <thead><tr><th>Ngày</th><th style="text-align:right">Lập</th><th style="text-align:right">Thực hiện</th><th style="text-align:right">Huỷ</th></tr></thead>
            <tbody>${d.week.map((w) => `
              <tr style="${w.date === d.date ? 'background:var(--teal-soft)' : ''}">
                <td><a href="#/phieu-thao-tac?ngay=${w.date}">${esc(viDate(w.date).slice(0, 5))}</a></td>
                <td style="text-align:right">${w.lap || '·'}</td>
                <td style="text-align:right">${w.thuc_hien || '·'}</td>
                <td style="text-align:right">${w.huy || '·'}</td>
              </tr>`).join('')}</tbody>
          </table>
        </section>
    </div>`;

  const go = (value) => navigate('/phieu-thao-tac', value ? { ngay: value } : undefined);
  qsa('[data-day]', body).forEach((el) => el.addEventListener('click', () => go(el.dataset.day)));
  qs('#dash-day', body).addEventListener('change', (e) => go(e.target.value));
  qs('#dash-new', body).addEventListener('click', () => qs('#new-ticket')?.click());
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-done]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const t = await api.put(`${BASE}/${btn.dataset.done}`, { status: 'da_thuc_hien' });
      toast(`Phiếu ${t.code}: đã xác nhận thực hiện`, 'success');
      renderDashboard(body, day);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

function pickTemplate(templates) {
  if (!templates.items.length) {
    toast('Chưa có mẫu phiếu nào. Tải mẫu phiếu Word lên trước.', 'error');
    navigate('/phieu-thao-tac', { tab: 'mau' });
    return;
  }
  openModal({
    title: 'Chọn mẫu để lập phiếu',
    wide: true,
    body: groupedTemplates(templates.items, (t) => `
      <a class="row-card" href="#/phieu-thao-tac/lap/${t.id}" data-close style="padding:10px 12px">
        <div class="row-body">
          <div class="row-title" style="font-size:13.5px">${esc(t.name)}</div>
          <div class="row-meta">${t.fields.length} ô cần điền</div>
        </div>
      </a>`, { compact: true }),
  });
}

// ------------------------------------------------------------ phiếu đã lập

function renderTickets(body, templates, query) {
  body.innerHTML = `
    <div class="toolbar">
      <div class="search">
        ${icon('search', 17)}
        <input class="input" id="t-q" placeholder="Tìm theo số phiếu, tên người, nội dung…" value="${esc(query.q || '')}">
      </div>
      <select class="select" id="t-template">
        <option value="">Mọi mẫu phiếu</option>
        ${templates.items.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
      </select>
      <select class="select" id="t-status"><option value="">Mọi trạng thái</option></select>
      <select class="select" id="t-year"><option value="">Mọi năm</option></select>
    </div>
    <div id="t-list"></div>`;

  const list = qs('#t-list', body);
  const inputs = ['#t-q', '#t-template', '#t-status', '#t-year'].map((s) => qs(s, body));
  let filled = false;
  let timer;
  inputs.forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, el.tagName === 'SELECT' ? 0 : 250);
  }));

  async function load() {
    list.innerHTML = loading();
    try {
      const data = await api.get(BASE, {
        q: inputs[0].value.trim(), template_id: inputs[1].value,
        status: inputs[2].value, year: inputs[3].value,
      });
      if (!filled) {
        inputs[2].innerHTML += data.statuses.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('');
        inputs[3].innerHTML += data.years.map((y) => `<option value="${y}">${y}</option>`).join('');
        filled = true;
      }
      list.innerHTML = data.items.length
        ? `<div class="list">${data.items.map(ticketRow).join('')}</div>
           <div class="text-muted" style="margin-top:14px">${data.total} phiếu</div>`
        : emptyState({
            iconName: 'forms',
            title: templates.items.length ? 'Chưa có phiếu nào' : 'Chưa có mẫu phiếu',
            text: templates.items.length
              ? 'Bấm "Lập phiếu mới", chọn mẫu rồi điền người viết, người duyệt, người thao tác…'
              : 'Tải mẫu phiếu Word của nhà máy lên trước (tab "Mẫu phiếu").',
          });
    } catch (err) {
      list.innerHTML = errorState(err.message);
    }
  }
  load();
}

function peopleSummary(values) {
  return Object.entries(values)
    .filter(([k, v]) => v && /^người/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => `<span>${icon('user', 13)} ${esc(k.replace(/^người\s*/i, ''))}: ${esc(v)}</span>`)
    .join('');
}

function ticketRow(t) {
  return `
    <a class="row-card" href="#/phieu-thao-tac/${t.id}" style="${t.status === 'huy' ? 'opacity:.62' : ''}">
      <span class="thumb" style="background:var(--violet-soft);color:var(--violet)">${icon('forms', 18)}</span>
      <div class="row-body">
        <div class="row-title">
          <span class="mono">${esc(t.code)}</span> — ${esc(t.template_name)}
        </div>
        <div class="row-meta">
          <span>${icon('clock', 13)} ${esc(viDate(t.ticket_date))}</span>
          ${peopleSummary(t.values)}
        </div>
        ${t.note ? `<div class="row-desc">${esc(t.note)}</div>` : ''}
      </div>
      <div class="row-side">
        <span class="badge ${STATUS_BADGE[t.status] || 'badge-grey'}">${esc(t.status_label)}</span>
      </div>
    </a>`;
}

// ------------------------------------------------------------ mẫu phiếu

const HOW_TO = `
  <div class="callout callout-info" style="line-height:1.75">
    <b>Cách chuẩn bị mẫu:</b> mở phiếu thao tác bằng Word, xoá giá trị cụ thể ở những chỗ thay đổi
    mỗi lần lập và gõ vào đó <b>tên ô trong cặp ngoặc nhọn kép</b>, ví dụ
    <b style="color:var(--teal)">{{Số phiếu}}</b>, <b style="color:var(--teal)">{{Người viết phiếu}}</b>, <b style="color:var(--teal)">{{Người thao tác}}</b>,
    <b style="color:var(--teal)">{{Giờ bắt đầu}}</b>, <b style="color:var(--teal)">ngày {{Ngày}} tháng {{Tháng}} năm {{Năm}}</b>.
    Lưu file .docx rồi tải lên. Mọi thứ khác (bảng trình tự, logo, định dạng) giữ nguyên.
    <br>Tên ô <b style="color:var(--teal)">{{Số phiếu}}</b> được cấp số tự động; ô bắt đầu bằng "Ngày", "Giờ" có lịch
    và đồng hồ để chọn. Cùng một tên ô xuất hiện nhiều chỗ thì được điền ở tất cả các chỗ đó.
    <br><a href="${BASE}/mau-vi-du">${icon('download', 14)} Tải mẫu ví dụ</a> — dựng từ phiếu
    "Đưa MBA T2-TD92 vào làm việc", đã đặt sẵn các ô để xem cách làm.
  </div>`;

function renderTemplates(body, templates) {
  body.innerHTML = `
    ${HOW_TO}
    <div style="margin-top:16px">
      ${templates.items.length
        ? groupedTemplates(templates.items, templateCard)
        : emptyState({ iconName: 'upload', title: 'Chưa có mẫu phiếu',
                       text: 'Bấm "Tải mẫu phiếu" ở góc trên để thêm mẫu đầu tiên.' })}
    </div>`;

  body.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) {
      const item = await api.get(`${BASE}/mau/${edit.dataset.edit}`);
      openEditTemplate(item, templates.categories);
    }
    if (del) {
      const ok = await confirmDialog('Xoá mẫu phiếu này? Chỉ xoá được mẫu chưa dùng để lập phiếu nào.',
                                     { title: 'Xoá mẫu phiếu' });
      if (!ok) return;
      try {
        await api.del(`${BASE}/mau/${del.dataset.del}`);
        toast('Đã xoá mẫu phiếu', 'success');
        navigate('/phieu-thao-tac', { tab: 'mau' });
      } catch (err) { toast(err.message, 'error', 8000); }
    }
  });
}

// Chia PTT mẫu như phân loại của nhà máy: trường hợp áp dụng (vận hành bình
// thường / bảo dưỡng, sửa chữa), rồi đến loại phiếu (cô lập / tái lập).
const CONTEXTS = [
  ['van_hanh', 'Vận hành bình thường'],
  ['bao_duong', 'Bảo dưỡng, sửa chữa'],
];
const TYPES = [['co_lap', 'Phiếu cô lập'], ['tai_lap', 'Phiếu tái lập']];

function groupedTemplates(items, card, { compact = false } = {}) {
  const out = [];
  CONTEXTS.forEach(([ctx, ctxLabel]) => {
    const inCtx = items.filter((t) => t.category.startsWith(`${ctx}_`));
    out.push(`<div class="section-title" style="margin:${compact ? '10px 0 6px' : '20px 0 10px'};font-size:14px">${esc(ctxLabel)}</div>`);
    out.push(`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(${compact ? 220 : 300}px,1fr))">`);
    TYPES.forEach(([type, typeLabel]) => {
      const list = inCtx.filter((t) => t.category === `${ctx}_${type}`);
      out.push(`<div>
        <div class="text-muted" style="font-size:12.5px;font-weight:600;margin-bottom:8px">${esc(typeLabel)} (${list.length})</div>
        ${list.length
          ? `<div class="${compact ? 'list' : 'grid'}" style="gap:10px">${list.map(card).join('')}</div>`
          : `<div class="text-muted" style="font-size:13px;padding:10px 0">Chưa có mẫu.</div>`}
      </div>`);
    });
    out.push('</div>');
  });
  const other = items.filter((t) => !CONTEXTS.some(([ctx]) => t.category.startsWith(`${ctx}_`)));
  if (other.length) {
    out.push(`<div class="section-title" style="margin:20px 0 10px;font-size:14px">Khác</div>`);
    out.push(`<div class="${compact ? 'list' : 'grid card-grid'}" style="gap:10px">${other.map(card).join('')}</div>`);
  }
  return out.join('');
}

function templateCard(t) {
  return `
    <section class="card">
      <div class="card-head" style="align-items:flex-start">
        <div>
          <h2 class="card-title">${esc(t.name)}</h2>
          <div class="row-meta" style="margin-top:6px">
            <span class="badge badge-grey">${esc(t.category_label)}</span>
            <span class="text-muted" style="font-size:12.5px">${t.n_tickets} phiếu đã lập</span>
          </div>
        </div>
      </div>
      <div class="text-muted" style="font-size:12.5px;margin-bottom:6px">Số phiếu:
        <span class="mono">${esc(t.number_format)}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
        ${t.fields.map((f) => `<span class="chip" style="cursor:default">${esc(f.name)}</span>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-primary btn-sm" href="#/phieu-thao-tac/lap/${t.id}">${icon('plus', 15)}Lập phiếu</a>
        <a class="btn btn-sm" href="${BASE}/mau/${t.id}/file">${icon('download', 15)}Tải mẫu gốc</a>
        <button class="btn btn-sm" data-edit="${t.id}">${icon('edit', 15)}Sửa</button>
        ${t.n_tickets ? '' : `<button class="btn btn-sm btn-danger" data-del="${t.id}">${icon('trash', 15)}</button>`}
      </div>
    </section>`;
}

function categoryOptions(categories, selected) {
  return categories.map((c) => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>
    ${esc(c.label)}</option>`).join('');
}

const FORMAT_HINT = `<span class="hint">("###" là số thứ tự, "YYYY" là năm. Các mẫu cùng định dạng dùng
  chung một dãy số như cùng một quyển sổ phiếu)</span>`;

function openUpload(categories, onDone) {
  openModal({
    title: 'Tải mẫu phiếu thao tác',
    wide: true,
    body: `
      <form id="tpl-form">
        <div class="field">
          <label>File mẫu <span class="hint">(Word .docx, đã đặt các ô {{...}})</span></label>
          <input class="input" type="file" name="file" accept=".docx" required>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Tên mẫu <span class="hint">(để trống sẽ lấy theo tên file)</span></label>
            <input class="input" name="name" placeholder="VD: Đưa MBA T2-TD92 vào làm việc">
          </div>
          <div class="field">
            <label>Loại phiếu</label>
            <select class="select" name="category">${categoryOptions(categories, 'khac')}</select>
          </div>
        </div>
        <div class="field">
          <label>Định dạng số phiếu ${FORMAT_HINT}</label>
          <input class="input mono" name="number_format" value="###/YYYY/KH/HHC" required>
        </div>
        ${HOW_TO}
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-upload">${icon('upload', 16)}Tải lên</button>`,
    onMount(root, close) {
      const btn = qs('#do-upload', root);
      btn.addEventListener('click', async () => {
        const form = qs('#tpl-form', root);
        if (!form.reportValidity()) return;
        btn.disabled = true;
        try {
          const item = await api.upload(`${BASE}/mau`, new FormData(form));
          close();
          onDone(item);
        } catch (err) {
          toast(err.message, 'error', 10000);
          btn.disabled = false;
        }
      });
    },
  });
}

function openEditTemplate(item, categories) {
  openModal({
    title: 'Sửa mẫu phiếu',
    body: `
      <form id="edit-form">
        <div class="field"><label>Tên mẫu</label>
          <input class="input" name="name" value="${esc(item.name)}" required></div>
        <div class="field"><label>Loại phiếu</label>
          <select class="select" name="category">${categoryOptions(categories, item.category)}</select></div>
        <div class="field"><label>Định dạng số phiếu ${FORMAT_HINT}</label>
          <input class="input mono" name="number_format" value="${esc(item.number_format)}" required></div>
        <div class="field">
          <label>Số tiếp theo năm ${item.next.year}
            <span class="hint">(đặt khi bắt đầu dùng phần mềm giữa năm, để nối tiếp sổ phiếu giấy)</span></label>
          <input class="input" type="number" min="1" name="next_number" value="${item.next.number}">
          <span class="hint" id="next-preview">Phiếu kế tiếp sẽ mang số <b class="mono">${esc(item.next.code)}</b></span>
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-save">${icon('check', 16)}Lưu</button>`,
    onMount(root, close) {
      qs('#do-save', root).addEventListener('click', async () => {
        const form = qs('#edit-form', root);
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        try {
          const saved = await api.put(`${BASE}/mau/${item.id}`, {
            name: data.name, category: data.category, number_format: data.number_format,
          });
          const next = Number(data.next_number);
          if (next && (next !== saved.next.number)) {
            await api.put(`${BASE}/so-tiep-theo`, { template_id: item.id, next_number: next });
          }
          close();
          toast('Đã lưu mẫu phiếu', 'success');
          navigate('/phieu-thao-tac', { tab: 'mau' });
        } catch (err) { toast(err.message, 'error', 8000); }
      });
    },
  });
}

// ------------------------------------------------------------ biểu mẫu nhập liệu

function hasSplitDate(fields) {
  return fields.some((f) => ['day', 'month', 'year'].includes(f.kind));
}

function fieldsForm(fields, values, suggestions, code) {
  const out = [];
  if (code) {
    out.push(`<div class="field"><label>Số phiếu</label>
      <input class="input mono" value="${esc(code)}" disabled></div>`);
  }
  if (hasSplitDate(fields)) {
    out.push(`<div class="field"><label>Ngày thao tác <span class="hint">(điền vào các ô Ngày/Tháng/Năm của mẫu)</span></label>
      <input class="input" type="date" data-key="${DATE_KEY}" value="${esc(values[DATE_KEY] || today())}" required></div>`);
  }
  const inputs = fields.filter((f) => !['number', 'day', 'month', 'year'].includes(f.kind));
  const short = inputs.filter((f) => f.kind !== 'multiline');
  const long = inputs.filter((f) => f.kind === 'multiline');
  out.push('<div class="field-row">');
  short.forEach((f, i) => {
    const value = values[f.name] ?? (f.kind === 'date' ? today() : '');
    const options = suggestions[f.name] || [];
    const type = f.kind === 'date' ? 'date' : f.kind === 'time' ? 'time' : 'text';
    out.push(`<div class="field"><label>${esc(f.name)}</label>
      <input class="input" type="${type}" data-key="${esc(f.name)}" value="${esc(value)}"
             ${options.length ? `list="dl-${i}"` : ''} autocomplete="off">
      ${options.length ? `<datalist id="dl-${i}">${options.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}
    </div>`);
  });
  out.push('</div>');
  long.forEach((f) => {
    out.push(`<div class="field"><label>${esc(f.name)}</label>
      <textarea class="textarea" data-key="${esc(f.name)}" style="min-height:74px">${esc(values[f.name] || '')}</textarea></div>`);
  });
  return out.join('');
}

function collect(root) {
  const values = {};
  qsa('[data-key]', root).forEach((el) => { values[el.dataset.key] = el.value.trim(); });
  return values;
}

// ------------------------------------------------------------ lập phiếu mới

async function renderNew(root, templateId) {
  root.innerHTML = loading();
  let item;
  try {
    item = await api.get(`${BASE}/mau/${templateId}`);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  setPage({
    title: 'Lập phiếu thao tác',
    subtitle: item.name,
    actions: `<a class="btn btn-sm" href="#/phieu-thao-tac">${icon('chevronLeft', 15)}Danh sách phiếu</a>`,
  });

  root.innerHTML = `
    <div class="grid two-col">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Thông tin phiếu</h2>
          <div class="card-actions">
            <button class="btn btn-sm" id="copy-last">${icon('copy', 15)}Lấy lại từ phiếu gần nhất</button>
          </div>
        </div>
        <form id="ticket-form" onsubmit="return false">
          ${fieldsForm(item.fields, {}, item.suggestions, '')}
        </form>
        <button class="btn btn-primary" id="save" style="margin-top:6px">${icon('check', 16)}Lưu và cấp số phiếu</button>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Số phiếu</h2></div>
        <div style="font-size:26px;font-weight:800;letter-spacing:.5px" class="mono">${esc(item.next.code)}</div>
        <p class="text-muted" style="font-size:13px;line-height:1.7;margin:8px 0 0">
          Số dự kiến. Số chính thức được cấp lúc bấm <b>Lưu</b> — nếu cùng lúc có người khác lưu phiếu
          cùng sổ thì phiếu này nhận số kế tiếp, không bao giờ trùng.
        </p>
        <dl class="kv" style="margin-top:16px">
          <dt>Mẫu</dt><dd>${esc(item.name)}</dd>
          <dt>Loại</dt><dd>${esc(item.category_label)}</dd>
          <dt>Ô cần điền</dt><dd>${item.fields.length}</dd>
        </dl>
      </section>
    </div>`;

  const form = qs('#ticket-form', root);
  qs('#copy-last', root).addEventListener('click', async () => {
    const data = await api.get(BASE, { template_id: templateId });
    const last = data.items.find((t) => t.status !== 'huy');
    if (!last) { toast('Mẫu này chưa có phiếu nào để lấy lại', 'info'); return; }
    // Lấy lại người và nội dung, nhưng ngày giờ thì để theo lần lập này.
    qsa('[data-key]', form).forEach((el) => {
      const kind = item.fields.find((f) => f.name === el.dataset.key)?.kind;
      if (el.dataset.key !== DATE_KEY && kind !== 'date' && kind !== 'time' && last.values[el.dataset.key]) {
        el.value = last.values[el.dataset.key];
      }
    });
    toast(`Đã lấy lại thông tin từ phiếu ${last.code}. Kiểm tra lại trước khi lưu.`, 'success');
  });

  qs('#save', root).addEventListener('click', async (e) => {
    if (!form.reportValidity()) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const saved = await api.post(BASE, { template_id: templateId, values: collect(form) });
      toast(`Đã cấp số phiếu ${saved.code}`, 'success', 6000);
      navigate(`/phieu-thao-tac/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 8000);
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------ chi tiết phiếu

async function renderTicket(root, id) {
  root.innerHTML = loading();
  let t;
  try {
    t = await api.get(`${BASE}/${id}`);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  setPage({
    title: `Phiếu thao tác số ${t.code}`,
    subtitle: t.template_name,
    actions: `
      <a class="btn btn-sm" href="#/phieu-thao-tac">${icon('chevronLeft', 15)}Danh sách</a>
      <a class="btn btn-accent btn-sm" href="${BASE}/${id}/xem" target="_blank" rel="noopener">${icon('library', 15)}XEM PHIẾU</a>
      <a class="btn btn-sm" href="${BASE}/${id}/word">${icon('download', 15)}Tải Word để in</a>`,
  });

  root.innerHTML = `
    ${t.status === 'huy' ? `<div class="callout callout-danger" style="margin-bottom:16px">
      Phiếu đã huỷ${t.note ? `: ${esc(t.note)}` : ''}. Số ${esc(t.code)} vẫn giữ trong sổ, không cấp lại cho phiếu khác.</div>` : ''}
    <div class="grid two-col">
      <section class="card">
        <div class="card-head"><h2 class="card-title">Thông tin phiếu</h2></div>
        <form id="ticket-form" onsubmit="return false">
          ${fieldsForm(t.fields, t.values, t.suggestions, t.code)}
        </form>
        <button class="btn btn-primary" id="save">${icon('check', 16)}Lưu thay đổi</button>
        <span class="text-muted" style="font-size:12.5px;margin-left:10px">Số phiếu giữ nguyên khi sửa.</span>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Trạng thái</h2></div>
        <div class="field">
          <label>Trạng thái phiếu</label>
          <select class="select" id="status">
            <option value="da_lap" ${t.status === 'da_lap' ? 'selected' : ''}>Đã lập</option>
            <option value="da_thuc_hien" ${t.status === 'da_thuc_hien' ? 'selected' : ''}>Đã thực hiện</option>
            <option value="huy" ${t.status === 'huy' ? 'selected' : ''}>Đã huỷ</option>
          </select>
        </div>
        <div class="field">
          <label>Ghi chú <span class="hint">(lý do huỷ, sự kiện bất thường…)</span></label>
          <textarea class="textarea" id="note" style="min-height:70px">${esc(t.note || '')}</textarea>
        </div>
        <button class="btn" id="save-status">${icon('check', 15)}Cập nhật trạng thái</button>
        <dl class="kv" style="margin-top:18px">
          <dt>Số phiếu</dt><dd class="mono">${esc(t.code)}</dd>
          <dt>Ngày thao tác</dt><dd>${esc(viDate(t.ticket_date))}</dd>
          <dt>Lập lúc</dt><dd>${esc(formatDateTime(t.created_at))}</dd>
          <dt>Sửa lần cuối</dt><dd>${esc(formatDateTime(t.updated_at))}</dd>
        </dl>
      </section>
    </div>`;

  const form = qs('#ticket-form', root);
  qs('#save', root).addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    try {
      await api.put(`${BASE}/${id}`, { values: collect(form) });
      toast('Đã lưu. File Word của phiếu đã cập nhật theo nội dung mới.', 'success');
      renderTicket(root, id);
    } catch (err) { toast(err.message, 'error'); }
  });
  qs('#save-status', root).addEventListener('click', async () => {
    const status = qs('#status', root).value;
    const note = qs('#note', root).value;
    if (status === 'huy' && t.status !== 'huy') {
      const ok = await confirmDialog(`Huỷ phiếu ${t.code}? Số phiếu này sẽ không được cấp lại.`,
                                     { title: 'Huỷ phiếu' });
      if (!ok) return;
    }
    try {
      await api.put(`${BASE}/${id}`, { status, note });
      toast('Đã cập nhật trạng thái', 'success');
      renderTicket(root, id);
    } catch (err) { toast(err.message, 'error'); }
  });
}
