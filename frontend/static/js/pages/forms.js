import { api } from '../api.js';
import { icon } from '../icons.js';
import { printOperationTicket } from '../print.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, formatDateTime, loading, openModal,
  qs, repeatList, toast,
} from '../ui.js';

export const meta = {
  title: 'Trình tự thao tác mẫu',
  subtitle: 'Trình tự thao tác chuẩn theo trường hợp áp dụng, làm căn cứ tra cứu cho trợ lý và in tham khảo tại hiện trường',
};

const CONTEXTS = {
  van_hanh: { label: 'Vận hành bình thường' },
  bao_duong: { label: 'Bảo dưỡng, sửa chữa' },
};

const TYPES = {
  co_lap: { label: 'Phiếu cô lập', icon: 'shield', tone: 'amber' },
  tai_lap: { label: 'Phiếu tái lập', icon: 'forms', tone: 'green' },
};

// Nhà máy dùng chung một mẫu phiếu thao tác cho cả cô lập và tái lập; phân
// loại cô lập/tái lập chỉ để tra cứu trong thư viện, không đổi mẫu in.
export function printForm(form) {
  printOperationTicket(form);
}

export async function render(root, ctx) {
  if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));

  setPage({
    ...meta,
    actions: `<button class="btn btn-accent" id="add-btn">${icon('plus', 16)}THÊM BIỂU MẪU</button>`,
  });
  root.innerHTML = loading();

  let equipment;
  try {
    equipment = await api.equipmentList();
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }

  let activeContext = ctx.query.truong_hop || '';
  let activeType = ctx.query.loai || '';

  root.innerHTML = `
    <div class="tabs" id="context-tabs">
      <button class="tab ${activeContext === '' ? 'active' : ''}" data-context="">Tất cả</button>
      ${Object.entries(CONTEXTS).map(([value, c]) => `
        <button class="tab ${activeContext === value ? 'active' : ''}" data-context="${value}">${esc(c.label)}</button>`).join('')}
    </div>
    <div class="toolbar" id="type-chips">
      <button class="chip ${activeType === '' ? 'active' : ''}" data-type="">Cả hai loại</button>
      ${Object.entries(TYPES).map(([value, t]) => `
        <button class="chip ${activeType === value ? 'active' : ''}" data-type="${value}">
          ${icon(t.icon, 14)}${esc(t.label)}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="search">
        ${icon('search', 17)}
        <input class="input" id="filter-q" placeholder="Tìm theo tên biểu mẫu, dạng công tác, thiết bị…">
      </div>
      <select class="select" id="filter-equipment">
        <option value="">Mọi thiết bị</option>
        ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div id="form-list"></div>`;

  const list = qs('#form-list', root);
  const inputQ = qs('#filter-q', root);
  const selectEq = qs('#filter-equipment', root);

  let timer;
  inputQ.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 240); });
  selectEq.addEventListener('change', load);

  qs('#context-tabs', root).addEventListener('click', (e) => {
    const tab = e.target.closest('[data-context]');
    if (!tab) return;
    activeContext = tab.dataset.context;
    qs('#context-tabs', root).querySelectorAll('.tab')
      .forEach((t) => t.classList.toggle('active', t === tab));
    load();
  });

  qs('#type-chips', root).addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    activeType = chip.dataset.type;
    qs('#type-chips', root).querySelectorAll('.chip')
      .forEach((c) => c.classList.toggle('active', c === chip));
    load();
  });

  qs('#add-btn').addEventListener('click', () => {
    openEditor(null, equipment.items, {
      form_type: activeType || 'co_lap',
      context: activeContext || 'bao_duong',
    }, load);
  });

  list.addEventListener('click', async (e) => {
    const printBtn = e.target.closest('[data-print]');
    if (printBtn) {
      e.preventDefault();
      e.stopPropagation();
      try { printForm(await api.form(printBtn.dataset.print)); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

  async function load() {
    list.innerHTML = loading();
    try {
      const data = await api.forms({
        form_type: activeType, context: activeContext,
        q: inputQ.value.trim(), equipment_id: selectEq.value,
      });
      list.innerHTML = data.items.length
        ? `<div class="list">${data.items.map(row).join('')}</div>
           <div class="text-muted" style="margin-top:14px">${data.total} biểu mẫu</div>`
        : emptyState({
            iconName: 'forms',
            title: 'Chưa có biểu mẫu nào',
            text: 'Tạo phiếu cô lập và phiếu tái lập cho từng trường hợp công tác để in nhanh khi cần.',
          });
    } catch (err) {
      list.innerHTML = errorState(err.message);
    }
  }

  load();
}

function row(item) {
  const type = TYPES[item.form_type] || TYPES.co_lap;
  const context = CONTEXTS[item.context];
  return `
    <a class="row-card" href="#/bieu-mau/${item.id}">
      <span class="thumb" style="background:var(--${type.tone}-soft);color:var(--${type.tone})">
        ${icon(type.icon, 18)}
      </span>
      <div class="row-body">
        <div class="row-title">${esc(item.title)}</div>
        <div class="row-meta">
          <span class="badge badge-${type.tone}">${esc(type.label)}</span>
          ${context ? `<span class="badge badge-grey">${esc(context.label)}</span>` : ''}
          ${item.code ? `<span class="mono">${esc(item.code)}</span>` : ''}
          ${item.work_type ? `<span>${esc(item.work_type)}</span>` : ''}
          ${item.equipment_name ? `<span>${icon('equipment', 13)} ${esc(item.equipment_name)}</span>` : ''}
          <span>${item.n_rows} dòng</span>
        </div>
        ${item.purpose ? `<div class="row-desc">${esc(item.purpose)}</div>` : ''}
      </div>
      <div class="row-side">
        <button class="btn btn-sm" data-print="${item.id}" title="In biểu mẫu">
          ${icon('printer', 15)}In
        </button>
      </div>
    </a>`;
}

function openEditor(existing, equipmentItems, defaults, onDone) {
  const type = existing?.form_type || defaults.form_type;
  const context = existing?.context || defaults.context;
  openModal({
    title: existing ? `Sửa biểu mẫu: ${existing.title}` : 'Thêm biểu mẫu',
    wide: true,
    body: `
      <form id="form-form">
        <div class="field-row">
          <div class="field">
            <label>Tên biểu mẫu *</label>
            <input class="input" name="title" required value="${esc(existing?.title || '')}"
                   placeholder="VD: Thao tác đưa tổ máy H1 ra sửa chữa">
          </div>
          <div class="field">
            <label>Mã biểu mẫu</label>
            <input class="input" name="code" value="${esc(existing?.code || '')}" placeholder="VD: PCL-01">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Trường hợp áp dụng</label>
            <select class="select" name="context">
              ${Object.entries(CONTEXTS).map(([value, c]) => `<option value="${value}"
                ${context === value ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Loại phiếu</label>
            <select class="select" name="form_type">
              ${Object.entries(TYPES).map(([value, t]) => `<option value="${value}"
                ${type === value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Dạng công tác</label>
            <input class="input" name="work_type" value="${esc(existing?.work_type || '')}"
                   placeholder="VD: Đưa thiết bị ra sửa chữa" list="work-types">
            <datalist id="work-types">
              <option value="Đưa thiết bị ra sửa chữa"></option>
              <option value="Đưa thiết bị vào vận hành"></option>
              <option value="Chuyển phương thức vận hành"></option>
              <option value="Thí nghiệm định kỳ"></option>
              <option value="Xử lý sự cố"></option>
            </datalist>
          </div>
          <div class="field">
            <label>Thiết bị</label>
            <select class="select" name="equipment_id">
              <option value="">— Không gắn thiết bị —</option>
              ${equipmentItems.map((e) => `<option value="${e.id}"
                ${existing?.equipment_id === e.id ? 'selected' : ''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Đơn vị đề nghị thao tác</label>
          <input class="input" name="requesting_unit" value="${esc(existing?.requesting_unit || '')}"
                 placeholder="VD: Phân xưởng VH-SC">
        </div>
        <div class="field">
          <label>Mục đích</label>
          <textarea class="textarea" name="purpose" style="min-height:52px">${esc(existing?.purpose || '')}</textarea>
        </div>
        <div class="field">
          <label>Điều kiện cần có để thực hiện
            <span class="hint">(mỗi điều kiện một dòng, in ra sẽ được đánh số)</span></label>
          <div id="conditions"></div>
        </div>
        <div class="field">
          <label>Trình tự hạng mục thao tác
            <span class="hint">(Mục I, II… — địa điểm — nội dung — lưu ý. Bỏ trống Mục thì
              bước nối tiếp hạng mục phía trên)</span></label>
          <div id="rows"></div>
        </div>
        <div class="field">
          <label>Ghi chú in trên phiếu</label>
          <textarea class="textarea" name="notes" style="min-height:52px">${esc(existing?.notes || '')}</textarea>
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-save">${icon('check', 16)}Lưu biểu mẫu</button>`,
    onMount(root, close) {
      const conditions = repeatList(qs('#conditions', root), {
        values: existing?.conditions || [],
        placeholder: 'VD: Có lệnh của Điều độ A1 và phương thức đã được duyệt',
      });
      const rows = repeatList(qs('#rows', root), {
        values: existing?.rows || [],
        fields: [
          { key: 'section', placeholder: 'Mục', flex: 1 },
          { key: 'target', placeholder: 'Địa điểm', flex: 2 },
          { key: 'action', placeholder: 'Nội dung thao tác', flex: 4 },
          { key: 'note', placeholder: 'Lưu ý', flex: 2 },
        ],
      });

      qs('#do-save', root).addEventListener('click', async (e) => {
        const form = qs('#form-form', root);
        if (!form.reportValidity()) return;
        e.target.disabled = true;
        const raw = Object.fromEntries(new FormData(form));
        const payload = {
          ...raw,
          equipment_id: raw.equipment_id ? Number(raw.equipment_id) : null,
          conditions: conditions.value(),
          rows: rows.value(),
        };
        try {
          if (existing) await api.put(`/api/forms/${existing.id}`, payload);
          else await api.post('/api/forms', payload);
          close();
          toast('Đã lưu biểu mẫu', 'success');
          onDone();
        } catch (err) {
          toast(err.message, 'error');
          e.target.disabled = false;
        }
      });
    },
  });
}

async function renderDetail(root, id) {
  root.innerHTML = loading();
  let form;
  let equipment;
  try {
    [form, equipment] = await Promise.all([api.form(id), api.equipmentList()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  const type = TYPES[form.form_type] || TYPES.co_lap;
  const context = CONTEXTS[form.context];

  setPage({
    title: form.title,
    subtitle: [type.label, context?.label, form.work_type, form.equipment_name]
      .filter(Boolean).join(' · '),
    actions: `
      <button class="btn btn-sm" data-back>${icon('chevronLeft', 15)}Danh sách</button>
      <button class="btn btn-accent btn-sm" id="print-btn">${icon('printer', 15)}IN PHIẾU</button>
      <button class="btn btn-sm" id="dup-btn">${icon('copy', 15)}Nhân bản</button>
      <button class="btn btn-sm" id="edit-btn">${icon('edit', 15)}Sửa</button>
      <button class="btn btn-sm btn-danger" id="del-btn">${icon('trash', 15)}Xoá</button>`,
  });

  root.innerHTML = `
    <div class="grid two-col">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Trình tự hạng mục thao tác</h2>
          <div class="card-actions"><span class="badge badge-grey">${form.rows.length} bước</span></div>
        </div>
        ${form.rows.length ? `
          <table class="table">
            <thead><tr>
              <th style="width:44px">Mục</th>
              <th style="width:44px">Bước</th>
              <th style="width:24%">Địa điểm</th>
              <th>Nội dung</th>
              <th style="width:20%">Lưu ý</th>
            </tr></thead>
            <tbody>${form.rows.map((r, i) => `
              <tr>
                <td class="text-muted">${esc(r.section || '')}</td>
                <td class="text-muted">${i + 1}</td>
                <td>${esc(r.target)}</td>
                <td>${esc(r.action)}</td>
                <td class="text-muted">${esc(r.note)}</td>
              </tr>`).join('')}</tbody>
          </table>`
          : '<p class="text-muted" style="margin:0">Biểu mẫu chưa có dòng nội dung nào.</p>'}
      </section>

      <div style="display:flex;flex-direction:column;gap:16px">
        ${form.conditions.length ? `
        <section class="card">
          <div class="card-head"><h2 class="card-title">Điều kiện cần có để thực hiện</h2></div>
          <ol style="margin:0;padding-left:20px;line-height:1.8">
            ${form.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}
          </ol>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2 class="card-title">Thông tin biểu mẫu</h2></div>
          <dl class="kv" style="grid-template-columns:120px 1fr">
            <dt>Loại phiếu</dt><dd>${esc(type.label)}</dd>
            ${context ? `<dt>Trường hợp</dt><dd>${esc(context.label)}</dd>` : ''}
            ${form.code ? `<dt>Mã</dt><dd class="mono">${esc(form.code)}</dd>` : ''}
            ${form.work_type ? `<dt>Dạng công tác</dt><dd>${esc(form.work_type)}</dd>` : ''}
            ${form.equipment_name ? `<dt>Thiết bị</dt><dd>
              <a href="#/thiet-bi/${form.equipment_id}">${esc(form.equipment_name)}</a></dd>` : ''}
            <dt>Cập nhật</dt><dd>${esc(formatDateTime(form.updated_at))}</dd>
          </dl>
          ${form.purpose ? `<div class="section-title">Mục đích</div>
            <p style="margin:0;line-height:1.7">${esc(form.purpose)}</p>` : ''}
          ${form.notes ? `<div class="section-title">Ghi chú</div>
            <p style="margin:0;line-height:1.7">${esc(form.notes)}</p>` : ''}
        </section>
      </div>
    </div>`;

  document.querySelector('[data-back]').addEventListener('click', () => navigate('/bieu-mau'));
  document.querySelector('#print-btn').addEventListener('click', () => printForm(form));
  document.querySelector('#edit-btn').addEventListener('click', () => {
    openEditor(form, equipment.items, {}, () => renderDetail(root, id));
  });
  document.querySelector('#dup-btn').addEventListener('click', async () => {
    try {
      const copy = await api.post(`/api/forms/${id}/duplicate`);
      toast('Đã nhân bản biểu mẫu', 'success');
      navigate(`/bieu-mau/${copy.id}`);
    } catch (err) { toast(err.message, 'error'); }
  });
  document.querySelector('#del-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(`Xoá biểu mẫu "${form.title}"?`, { title: 'Xoá biểu mẫu' });
    if (!ok) return;
    try {
      await api.del(`/api/forms/${id}`);
      toast('Đã xoá biểu mẫu', 'success');
      navigate('/bieu-mau');
    } catch (err) { toast(err.message, 'error'); }
  });
}
