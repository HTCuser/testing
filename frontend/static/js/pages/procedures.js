import { api } from '../api.js';
import { icon } from '../icons.js';
import { printProcedure } from '../print.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, loading, openModal, qs, repeatList, toast,
} from '../ui.js';

/** Trang quy trình dùng chung cho vận hành và bảo dưỡng, khác nhau ở `kind`. */
export function createProceduresPage({ kind, basePath, title, subtitle, iconName, tone }) {
  const meta = { title, subtitle };

  async function render(root, ctx) {
    if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));

    setPage({
      ...meta,
      actions: `<button class="btn btn-accent" id="add-btn">${icon('plus', 16)}THÊM QUY TRÌNH</button>`,
    });
    root.innerHTML = loading();

    let equipment;
    try {
      equipment = await api.equipmentList();
    } catch (err) {
      root.innerHTML = errorState(err.message);
      return;
    }

    root.innerHTML = `
      <div class="toolbar">
        <div class="search">
          ${icon('search', 17)}
          <input class="input" id="filter-q" placeholder="Tìm quy trình theo tên, mã, thiết bị…">
        </div>
        <select class="select" id="filter-equipment">
          <option value="">Mọi thiết bị</option>
          ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
        </select>
      </div>
      <div id="proc-list"></div>`;

    const list = qs('#proc-list', root);
    const inputQ = qs('#filter-q', root);
    const selectEq = qs('#filter-equipment', root);

    let timer;
    inputQ.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 240); });
    selectEq.addEventListener('change', load);
    qs('#add-btn').addEventListener('click', () => openEditor(null, equipment.items, kind, load));

    async function load() {
      list.innerHTML = loading();
      try {
        const data = await api.procedures({
          kind, q: inputQ.value.trim(), equipment_id: selectEq.value,
        });
        list.innerHTML = data.items.length
          ? `<div class="list">${data.items.map((p) => row(p, basePath, iconName, tone)).join('')}</div>`
          : emptyState({
              iconName,
              title: 'Chưa có quy trình nào',
              text: 'Số hoá quy trình thành các bước có đánh số để vận hành viên tra cứu nhanh và in ra khi cần.',
            });
      } catch (err) {
        list.innerHTML = errorState(err.message);
      }
    }

    load();
  }

  async function renderDetail(root, id) {
    root.innerHTML = loading();
    let proc;
    let equipment;
    try {
      [proc, equipment] = await Promise.all([api.procedure(id), api.equipmentList()]);
    } catch (err) {
      root.innerHTML = errorState(err.message);
      return;
    }
    if (isStale(root)) return;

    setPage({
      title: proc.title,
      subtitle: [proc.code, proc.kind_label, proc.equipment_name].filter(Boolean).join(' · '),
      actions: `
        <button class="btn btn-sm" data-back>${icon('chevronLeft', 15)}Danh sách</button>
        <button class="btn btn-sm" id="print-btn">${icon('printer', 15)}In quy trình</button>
        <button class="btn btn-sm" id="edit-btn">${icon('edit', 15)}Sửa</button>
        <button class="btn btn-sm btn-danger" id="del-btn">${icon('trash', 15)}Xoá</button>`,
    });

    root.innerHTML = `
      <div class="grid two-col">
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Trình tự thực hiện</h2>
            <div class="card-actions"><span class="badge badge-grey">${proc.steps.length} bước</span></div>
          </div>
          ${proc.steps.length ? `<ol class="step-list">${proc.steps.map((s, i) => `
            <li>
              <span class="step-no">${i + 1}</span>
              <div>
                <div class="step-text">${esc(s.text)}</div>
                ${s.note ? `<div class="step-note">${icon('incident', 13)} ${esc(s.note)}</div>` : ''}
              </div>
            </li>`).join('')}</ol>`
            : '<p class="text-muted" style="margin:0">Quy trình chưa có bước nào.</p>'}
        </section>

        <div style="display:flex;flex-direction:column;gap:16px">
          ${proc.safety.length ? `
            <section class="card">
              <div class="card-head"><h2 class="card-title">Biện pháp an toàn</h2></div>
              <div class="callout callout-danger">
                <ul class="bullet-list" style="color:inherit">
                  ${proc.safety.map((s) => `<li>${esc(s)}</li>`).join('')}
                </ul>
              </div>
            </section>` : ''}

          <section class="card">
            <div class="card-head"><h2 class="card-title">Thông tin quy trình</h2></div>
            <dl class="kv" style="grid-template-columns:120px 1fr">
              ${proc.code ? `<dt>Mã</dt><dd class="mono">${esc(proc.code)}</dd>` : ''}
              <dt>Loại</dt><dd>${esc(proc.kind_label)}</dd>
              ${proc.equipment_name ? `<dt>Thiết bị</dt><dd>
                <a href="#/thiet-bi/${proc.equipment_id}">${esc(proc.equipment_name)}</a></dd>` : ''}
              ${proc.source_ref ? `<dt>Căn cứ</dt><dd>${esc(proc.source_ref)}</dd>` : ''}
            </dl>
            ${proc.summary ? `<div class="section-title">Mục đích</div>
              <p style="margin:0;line-height:1.7">${esc(proc.summary)}</p>` : ''}
            ${proc.conditions ? `<div class="section-title">Điều kiện áp dụng</div>
              <p style="margin:0;line-height:1.7">${esc(proc.conditions)}</p>` : ''}
            <div class="section-title">Tra cứu</div>
            <button class="btn btn-primary" style="width:100%" id="ask-about">
              ${icon('assistant', 16)}Hỏi trợ lý về quy trình này
            </button>
          </section>
        </div>
      </div>`;

    document.querySelector('[data-back]').addEventListener('click', () => navigate(basePath));
    document.querySelector('#print-btn').addEventListener('click', () => printProcedure(proc));
    document.querySelector('#edit-btn').addEventListener('click', () => {
      openEditor(proc, equipment.items, kind, () => renderDetail(root, id));
    });
    document.querySelector('#del-btn').addEventListener('click', async () => {
      const ok = await confirmDialog(`Xoá quy trình "${proc.title}"?`, { title: 'Xoá quy trình' });
      if (!ok) return;
      try {
        await api.del(`/api/procedures/${id}`);
        toast('Đã xoá quy trình', 'success');
        navigate(basePath);
      } catch (err) { toast(err.message, 'error'); }
    });
    qs('#ask-about', root).addEventListener('click', () => navigate('/tro-ly', { q: proc.title }));
  }

  return { meta, render };
}

function row(item, basePath, iconName, tone) {
  return `
    <a class="row-card" href="#${basePath}/${item.id}">
      <span class="thumb" style="background:var(--${tone}-soft);color:var(--${tone})">${icon(iconName, 18)}</span>
      <div class="row-body">
        <div class="row-title">${esc(item.title)}</div>
        <div class="row-meta">
          ${item.code ? `<span class="mono">${esc(item.code)}</span>` : ''}
          ${item.equipment_name ? `<span>${icon('equipment', 13)} ${esc(item.equipment_name)}</span>` : ''}
          <span>${item.n_steps} bước</span>
          ${item.safety.length ? `<span>${icon('shield', 13)} ${item.safety.length} biện pháp an toàn</span>` : ''}
        </div>
        ${item.summary ? `<div class="row-desc">${esc(item.summary)}</div>` : ''}
      </div>
      <div class="row-side">${icon('chevronRight', 17)}</div>
    </a>`;
}

export function openEditor(existing, equipmentItems, kind, onDone) {
  openModal({
    title: existing ? `Sửa quy trình: ${existing.title}` : 'Thêm quy trình',
    wide: true,
    body: `
      <form id="proc-form">
        <div class="field-row">
          <div class="field">
            <label>Tên quy trình *</label>
            <input class="input" name="title" required value="${esc(existing?.title || '')}"
                   placeholder="VD: Khởi động tổ máy H1 từ trạng thái dừng dự phòng">
          </div>
          <div class="field">
            <label>Mã quy trình</label>
            <input class="input" name="code" value="${esc(existing?.code || '')}" placeholder="VD: QT-VH-01">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Loại quy trình</label>
            <select class="select" name="kind">
              <option value="van_hanh" ${(existing?.kind || kind) === 'van_hanh' ? 'selected' : ''}>Quy trình vận hành</option>
              <option value="bao_duong" ${(existing?.kind || kind) === 'bao_duong' ? 'selected' : ''}>Quy trình bảo dưỡng, sửa chữa</option>
              <option value="su_co" ${(existing?.kind || kind) === 'su_co' ? 'selected' : ''}>Quy trình xử lý sự cố</option>
            </select>
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
          <label>Mục đích</label>
          <textarea class="textarea" name="summary" style="min-height:56px">${esc(existing?.summary || '')}</textarea>
        </div>
        <div class="field">
          <label>Điều kiện áp dụng</label>
          <textarea class="textarea" name="conditions" style="min-height:56px">${esc(existing?.conditions || '')}</textarea>
        </div>
        <div class="field">
          <label>Biện pháp an toàn</label>
          <div id="safety"></div>
        </div>
        <div class="field">
          <label>Các bước thực hiện <span class="hint">(theo đúng thứ tự thao tác)</span></label>
          <div id="steps"></div>
        </div>
        <div class="field">
          <label>Căn cứ ban hành</label>
          <input class="input" name="source_ref" value="${esc(existing?.source_ref || '')}"
                 placeholder="VD: Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na, Điều 25">
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-save">${icon('check', 16)}Lưu quy trình</button>`,
    onMount(root, close) {
      const safety = repeatList(qs('#safety', root), {
        values: existing?.safety || [],
        placeholder: 'VD: Kiểm tra không có người trong buồng tuabin',
      });
      const steps = repeatList(qs('#steps', root), {
        values: existing?.steps || [],
        fields: [
          { key: 'text', placeholder: 'Nội dung bước thao tác', flex: 3 },
          { key: 'note', placeholder: 'Lưu ý (tuỳ chọn)', flex: 2 },
        ],
      });

      qs('#do-save', root).addEventListener('click', async (e) => {
        const form = qs('#proc-form', root);
        if (!form.reportValidity()) return;
        e.target.disabled = true;
        const raw = Object.fromEntries(new FormData(form));
        const payload = {
          ...raw,
          equipment_id: raw.equipment_id ? Number(raw.equipment_id) : null,
          safety: safety.value(),
          steps: steps.value(),
        };
        try {
          if (existing) await api.put(`/api/procedures/${existing.id}`, payload);
          else await api.post('/api/procedures', payload);
          close();
          toast('Đã lưu quy trình và cập nhật chỉ mục tra cứu', 'success');
          onDone();
        } catch (err) {
          toast(err.message, 'error');
          e.target.disabled = false;
        }
      });
    },
  });
}
