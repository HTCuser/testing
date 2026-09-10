import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, loading, openModal, qs, repeatList, toast,
} from '../ui.js';

export const meta = {
  title: 'Danh mục thiết bị',
  subtitle: 'Hồ sơ thiết bị chính của nhà máy và tài liệu, quy trình gắn với từng thiết bị',
};

export async function render(root, ctx) {
  if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));

  setPage({
    ...meta,
    actions: `<button class="btn btn-accent" id="add-btn">${icon('plus', 16)}THÊM THIẾT BỊ</button>`,
  });
  root.innerHTML = loading();

  let data;
  try {
    data = await api.equipmentList();
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div class="search">
        ${icon('search', 17)}
        <input class="input" id="filter-q" placeholder="Tìm theo mã, tên, hãng sản xuất…">
      </div>
      <select class="select" id="filter-system">
        <option value="">Mọi hệ thống</option>
        ${data.systems.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
      </select>
    </div>
    <div id="eq-list"></div>`;

  const list = qs('#eq-list', root);
  const inputQ = qs('#filter-q', root);
  const selectSystem = qs('#filter-system', root);

  let timer;
  inputQ.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 240); });
  selectSystem.addEventListener('change', load);
  qs('#add-btn').addEventListener('click', () => openEditor(null, load));

  async function load() {
    list.innerHTML = loading();
    try {
      const result = await api.equipmentList({ q: inputQ.value.trim(), system: selectSystem.value });
      list.innerHTML = result.items.length
        ? `<div class="grid card-grid">${result.items.map(card).join('')}</div>`
        : emptyState({
            iconName: 'equipment',
            title: 'Chưa có thiết bị nào',
            text: 'Khai báo thiết bị chính để gắn tài liệu, quy trình và hồ sơ sự cố theo từng thiết bị.',
          });
    } catch (err) {
      list.innerHTML = errorState(err.message);
    }
  }

  load();
}

function card(item) {
  return `
    <a class="card" href="#/thiet-bi/${item.id}" style="text-decoration:none;display:block">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <span class="thumb" style="background:var(--teal-soft);color:var(--teal)">${icon('equipment', 19)}</span>
        <div style="flex:1;min-width:0">
          <div class="row-title">${esc(item.name)}</div>
          <div class="row-meta">
            <span class="mono">${esc(item.code)}</span>
            ${item.system ? `<span>${esc(item.system)}</span>` : ''}
          </div>
        </div>
      </div>
      ${item.manufacturer || item.model ? `
        <div class="text-muted" style="margin-top:11px;font-size:12.5px">
          ${esc([item.manufacturer, item.model].filter(Boolean).join(' · '))}
        </div>` : ''}
      <div style="display:flex;gap:7px;margin-top:14px;flex-wrap:wrap">
        <span class="badge badge-blue">${item.n_documents} tài liệu</span>
        <span class="badge badge-green">${item.n_procedures} quy trình</span>
        <span class="badge badge-red">${item.n_incidents} sự cố</span>
      </div>
    </a>`;
}

function openEditor(existing, onDone) {
  const specs = existing?.specs || [];
  openModal({
    title: existing ? `Sửa thiết bị: ${existing.name}` : 'Thêm thiết bị',
    body: `
      <form id="eq-form">
        <div class="field-row">
          <div class="field">
            <label>Mã thiết bị *</label>
            <input class="input" name="code" required value="${esc(existing?.code || '')}"
                   placeholder="VD: H1-GEN">
          </div>
          <div class="field">
            <label>Tên thiết bị *</label>
            <input class="input" name="name" required value="${esc(existing?.name || '')}"
                   placeholder="VD: Máy phát tổ máy H1">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Hệ thống</label>
            <input class="input" name="system" value="${esc(existing?.system || '')}"
                   placeholder="VD: Tuabin - Máy phát" list="system-list">
            <datalist id="system-list">
              <option value="Tuabin - Máy phát"></option>
              <option value="Hệ thống kích từ"></option>
              <option value="Hệ thống điều tốc"></option>
              <option value="Hệ thống dầu áp lực"></option>
              <option value="Hệ thống nước kỹ thuật"></option>
              <option value="Hệ thống khí nén"></option>
              <option value="Thiết bị nhất thứ 220kV"></option>
              <option value="Hệ thống tự dùng"></option>
              <option value="Cửa nhận nước - Đập tràn"></option>
            </datalist>
          </div>
          <div class="field">
            <label>Vị trí lắp đặt</label>
            <input class="input" name="location" value="${esc(existing?.location || '')}"
                   placeholder="VD: Cao trình 195, gian máy">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Hãng sản xuất</label>
            <input class="input" name="manufacturer" value="${esc(existing?.manufacturer || '')}">
          </div>
          <div class="field">
            <label>Model / kiểu</label>
            <input class="input" name="model" value="${esc(existing?.model || '')}">
          </div>
          <div class="field">
            <label>Năm đưa vào vận hành</label>
            <input class="input" name="commissioned" value="${esc(existing?.commissioned || '')}"
                   placeholder="VD: 2013">
          </div>
        </div>
        <div class="field">
          <label>Thông số kỹ thuật chính</label>
          <div id="specs"></div>
        </div>
        <div class="field">
          <label>Ghi chú</label>
          <textarea class="textarea" name="notes" style="min-height:60px">${esc(existing?.notes || '')}</textarea>
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-save">${icon('check', 16)}Lưu thiết bị</button>`,
    onMount(root, close) {
      const specList = repeatList(qs('#specs', root), {
        values: specs,
        fields: [
          { key: 'label', placeholder: 'Thông số (VD: Công suất định mức)', flex: 1 },
          { key: 'value', placeholder: 'Giá trị (VD: 90 MW)', flex: 1 },
        ],
      });
      qs('#do-save', root).addEventListener('click', async (e) => {
        const form = qs('#eq-form', root);
        if (!form.reportValidity()) return;
        e.target.disabled = true;
        const payload = Object.fromEntries(new FormData(form));
        payload.specs = specList.value();
        try {
          if (existing) await api.put(`/api/equipment/${existing.id}`, payload);
          else await api.post('/api/equipment', payload);
          close();
          toast('Đã lưu thiết bị', 'success');
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
  let item;
  try {
    item = await api.equipment(id);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  setPage({
    title: item.name,
    subtitle: `${item.code}${item.system ? ' · ' + item.system : ''}`,
    actions: `
      <button class="btn btn-sm" data-back>${icon('chevronLeft', 15)}Danh mục</button>
      <button class="btn btn-sm" id="edit-btn">${icon('edit', 15)}Sửa</button>
      <button class="btn btn-sm btn-danger" id="del-btn">${icon('trash', 15)}Xoá</button>`,
  });

  root.innerHTML = `
    <div class="grid two-col">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Tài liệu kỹ thuật</h2>
            <div class="card-actions"><span class="badge badge-grey">${item.documents.length}</span></div>
          </div>
          ${item.documents.length ? `<div class="list">${item.documents.map((d) => `
            <a class="row-card" href="#/thu-vien/${d.id}" style="padding:12px 14px">
              <span class="thumb" style="width:32px;height:32px;background:var(--blue-soft);color:var(--blue)">
                ${icon('file', 15)}
              </span>
              <div class="row-body">
                <div class="row-title" style="font-size:13.5px">${esc(d.title)}</div>
                <div class="row-meta"><span>${d.n_chunks} đoạn</span></div>
              </div>
            </a>`).join('')}</div>`
            : '<p class="text-muted" style="margin:0">Chưa có tài liệu gắn với thiết bị này.</p>'}
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Quy trình liên quan</h2>
            <div class="card-actions"><span class="badge badge-grey">${item.procedures.length}</span></div>
          </div>
          ${item.procedures.length ? `<div class="list">${item.procedures.map((p) => `
            <a class="row-card" href="#/${p.kind === 'bao_duong' ? 'bao-duong' : 'van-hanh'}/${p.id}"
               style="padding:12px 14px">
              <span class="thumb" style="width:32px;height:32px;background:var(--green-soft);color:var(--green)">
                ${icon(p.kind === 'bao_duong' ? 'maintenance' : 'operations', 15)}
              </span>
              <div class="row-body">
                <div class="row-title" style="font-size:13.5px">${esc(p.title)}</div>
                ${p.code ? `<div class="row-meta"><span class="mono">${esc(p.code)}</span></div>` : ''}
              </div>
            </a>`).join('')}</div>`
            : '<p class="text-muted" style="margin:0">Chưa có quy trình gắn với thiết bị này.</p>'}
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Hồ sơ sự cố</h2>
            <div class="card-actions"><span class="badge badge-grey">${item.incidents.length}</span></div>
          </div>
          ${item.incidents.length ? `<div class="list">${item.incidents.map((s) => `
            <a class="row-card" href="#/su-co/${s.id}" style="padding:12px 14px">
              <span class="thumb" style="width:32px;height:32px;background:var(--red-soft);color:var(--red)">
                ${icon('incident', 15)}
              </span>
              <div class="row-body"><div class="row-title" style="font-size:13.5px">${esc(s.title)}</div></div>
            </a>`).join('')}</div>`
            : '<p class="text-muted" style="margin:0">Chưa ghi nhận sự cố nào cho thiết bị này.</p>'}
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2 class="card-title">Hồ sơ thiết bị</h2></div>
        <dl class="kv" style="grid-template-columns:135px 1fr">
          <dt>Mã thiết bị</dt><dd class="mono">${esc(item.code)}</dd>
          ${item.system ? `<dt>Hệ thống</dt><dd>${esc(item.system)}</dd>` : ''}
          ${item.location ? `<dt>Vị trí</dt><dd>${esc(item.location)}</dd>` : ''}
          ${item.manufacturer ? `<dt>Hãng sản xuất</dt><dd>${esc(item.manufacturer)}</dd>` : ''}
          ${item.model ? `<dt>Model</dt><dd>${esc(item.model)}</dd>` : ''}
          ${item.commissioned ? `<dt>Vận hành từ</dt><dd>${esc(item.commissioned)}</dd>` : ''}
        </dl>
        ${item.specs.length ? `
          <div class="section-title">Thông số kỹ thuật</div>
          <dl class="kv" style="grid-template-columns:1fr 1fr">
            ${item.specs.map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`).join('')}
          </dl>` : ''}
        ${item.notes ? `
          <div class="section-title">Ghi chú</div>
          <p style="margin:0;line-height:1.7">${esc(item.notes)}</p>` : ''}
        <div class="section-title">Tra cứu</div>
        <button class="btn btn-primary" style="width:100%" id="ask-about">
          ${icon('assistant', 16)}Hỏi trợ lý về thiết bị này
        </button>
      </section>
    </div>`;

  document.querySelector('[data-back]').addEventListener('click', () => navigate('/thiet-bi'));
  document.querySelector('#edit-btn').addEventListener('click', () => {
    openEditor(item, () => renderDetail(root, id));
  });
  document.querySelector('#del-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(
      `Xoá thiết bị "${item.name}"? Tài liệu và quy trình liên quan sẽ được gỡ liên kết chứ không bị xoá.`,
      { title: 'Xoá thiết bị' },
    );
    if (!ok) return;
    try {
      await api.del(`/api/equipment/${id}`);
      toast('Đã xoá thiết bị', 'success');
      navigate('/thiet-bi');
    } catch (err) { toast(err.message, 'error'); }
  });
  qs('#ask-about', root).addEventListener('click', () => {
    navigate('/tro-ly', { q: `Thông tin kỹ thuật và quy trình vận hành ${item.name}` });
  });
}
