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
  const tab = ctx.query.tab === 'mau' ? 'mau' : 'phieu';
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
      <button class="tab ${tab === 'phieu' ? 'active' : ''}" data-tab="phieu">Phiếu đã lập</button>
      <button class="tab ${tab === 'mau' ? 'active' : ''}" data-tab="mau">
        Mẫu phiếu <span class="badge badge-grey">${templates.items.length}</span></button>
    </div>
    <div id="tab-body"></div>`;

  qsa('[data-tab]', root).forEach((el) => el.addEventListener('click', () => {
    navigate('/phieu-thao-tac', el.dataset.tab === 'mau' ? { tab: 'mau' } : undefined);
  }));
  qs('#upload-tpl').addEventListener('click', () => openUpload(templates.categories, (item) => {
    toast(`Đã thêm mẫu "${item.name}" với ${item.fields.length} ô cần điền`, 'success');
    navigate('/phieu-thao-tac', { tab: 'mau' });
  }));
  qs('#new-ticket').addEventListener('click', () => pickTemplate(templates));

  const body = qs('#tab-body', root);
  if (tab === 'mau') renderTemplates(body, templates);
  else renderTickets(body, templates, ctx.query);
}

function pickTemplate(templates) {
  if (!templates.items.length) {
    toast('Chưa có mẫu phiếu nào. Tải mẫu phiếu Word lên trước.', 'error');
    navigate('/phieu-thao-tac', { tab: 'mau' });
    return;
  }
  openModal({
    title: 'Chọn mẫu để lập phiếu',
    body: `<div class="list">${templates.items.map((t) => `
      <a class="row-card" href="#/phieu-thao-tac/lap/${t.id}" data-close>
        <span class="thumb" style="background:var(--violet-soft);color:var(--violet)">${icon('forms', 18)}</span>
        <div class="row-body">
          <div class="row-title">${esc(t.name)}</div>
          <div class="row-meta"><span class="badge badge-grey">${esc(t.category_label)}</span>
            <span>${t.fields.length} ô cần điền</span></div>
        </div>
      </a>`).join('')}</div>`,
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
    <code>{{Số phiếu}}</code>, <code>{{Người viết phiếu}}</code>, <code>{{Người thao tác}}</code>,
    <code>{{Giờ bắt đầu}}</code>, <code>ngày {{Ngày}} tháng {{Tháng}} năm {{Năm}}</code>.
    Lưu file .docx rồi tải lên. Mọi thứ khác (bảng trình tự, logo, định dạng) giữ nguyên.
    <br>Tên ô <code>{{Số phiếu}}</code> được cấp số tự động; ô bắt đầu bằng "Ngày", "Giờ" có lịch
    và đồng hồ để chọn. Cùng một tên ô xuất hiện nhiều chỗ thì được điền ở tất cả các chỗ đó.
    <br><a href="${BASE}/mau-vi-du">${icon('download', 14)} Tải mẫu ví dụ</a> — dựng từ phiếu
    "Đưa MBA T2-TD92 vào làm việc", đã đặt sẵn các ô để xem cách làm.
  </div>`;

function renderTemplates(body, templates) {
  body.innerHTML = `
    ${HOW_TO}
    <div style="margin-top:16px">
      ${templates.items.length
        ? `<div class="grid card-grid">${templates.items.map(templateCard).join('')}</div>`
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
