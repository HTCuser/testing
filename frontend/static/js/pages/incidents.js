import { api } from '../api.js';
import { icon } from '../icons.js';
import { printIncident } from '../print.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, formatDateTime, loading, openModal,
  qs, repeatList, toast,
} from '../ui.js';

export const meta = {
  title: 'Xử lý sự cố và bất thường',
  subtitle: 'Tra cứu nhanh theo hiện tượng, kèm bài học kinh nghiệm tích luỹ từ thực tế vận hành',
};

const SEVERITY = {
  nghiem_trong: ['badge-red', 'Nghiêm trọng'],
  trung_binh: ['badge-amber', 'Trung bình'],
  nhe: ['badge-grey', 'Nhẹ / bất thường'],
};

const SOURCE = {
  quy_trinh: ['badge-blue', 'Theo quy trình'],
  kinh_nghiem: ['badge-green', 'Kinh nghiệm Hủa Na'],
  nha_may_khac: ['badge-violet', 'Nhà máy khác'],
};

export async function render(root, ctx) {
  if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));

  setPage({
    ...meta,
    actions: `<button class="btn btn-accent" id="add-btn">${icon('plus', 16)}THÊM HỒ SƠ SỰ CỐ</button>`,
  });
  root.innerHTML = loading();

  let equipment;
  let metaData;
  try {
    [equipment, metaData] = await Promise.all([api.equipmentList(), api.incidentMeta()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }

  root.innerHTML = `
    <section class="card" style="margin-bottom:16px;border-left:3.5px solid var(--red)">
      <div class="card-head">
        <span class="thumb" style="background:var(--red-soft);color:var(--red)">${icon('zap', 19)}</span>
        <div>
          <h2 class="card-title">Tra cứu nhanh theo hiện tượng</h2>
          <div class="text-muted" style="font-size:12.5px;margin-top:2px">
            Mô tả hiện tượng đang gặp, hệ thống sẽ tìm trong quy trình xử lý sự cố và các hồ sơ đã ghi nhận.
          </div>
        </div>
      </div>
      <form id="symptom-form" class="toolbar" style="margin-bottom:0">
        <div class="search" style="flex:1 1 100%;max-width:none">
          ${icon('search', 17)}
          <input class="input" name="q" autocomplete="off"
                 placeholder="VD: nhiệt độ gối trục hướng máy phát tăng cao, rung tăng bất thường…">
        </div>
        <button class="btn btn-primary" type="submit">${icon('zap', 16)}Tra cứu</button>
      </form>
      <div id="symptom-result"></div>
    </section>

    <div class="toolbar">
      <div class="search">
        ${icon('search', 17)}
        <input class="input" id="filter-q" placeholder="Lọc danh sách hồ sơ sự cố…">
      </div>
      <select class="select" id="filter-severity">
        <option value="">Mọi mức độ</option>
        ${metaData.severities.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('')}
      </select>
      <select class="select" id="filter-source">
        <option value="">Mọi nguồn</option>
        ${metaData.sources.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('')}
      </select>
      <select class="select" id="filter-equipment">
        <option value="">Mọi thiết bị</option>
        ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div id="inc-list"></div>`;

  const list = qs('#inc-list', root);
  const filters = ['#filter-q', '#filter-severity', '#filter-source', '#filter-equipment']
    .map((sel) => qs(sel, root));

  let timer;
  filters.forEach((el) => {
    const event = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(event, () => {
      clearTimeout(timer);
      timer = setTimeout(load, event === 'input' ? 240 : 0);
    });
  });

  qs('#add-btn').addEventListener('click', () => openEditor(null, equipment.items, load));

  qs('#symptom-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = new FormData(e.target).get('q').trim();
    if (!question) return;
    const box = qs('#symptom-result', root);
    box.innerHTML = `<div style="padding:16px 0"><span class="spinner"></span>
      <span style="margin-left:10px;color:var(--muted)">Đang tra cứu…</span></div>`;
    try {
      const data = await api.search({ q: question, top_k: 6 });
      box.innerHTML = data.items.length ? `
        <div class="section-title">Kết quả liên quan nhất</div>
        <div class="list">${data.items.map((s) => {
          const href = s.source_kind === 'su_co' ? `#/su-co/${s.source_id}`
            : s.source_kind === 'quy_trinh' ? `#/van-hanh/${s.source_id}`
            : `#/thu-vien/${s.document_id}`;
          return `
            <a class="row-card" href="${href}" style="padding:12px 14px">
              <div class="row-body">
                <div class="row-title" style="font-size:13.5px">${esc(s.doc_title)}</div>
                ${s.heading ? `<div class="row-meta"><span>${esc(s.heading)}</span></div>` : ''}
                <div class="row-desc">${esc(s.excerpt)}</div>
              </div>
            </a>`;
        }).join('')}</div>
        <button class="btn btn-sm" style="margin-top:12px" id="deep-ask">
          ${icon('assistant', 15)}Hỏi trợ lý để có hướng dẫn chi tiết
        </button>`
        : `<div class="callout" style="margin-top:14px">Không tìm thấy hồ sơ nào khớp với hiện tượng này.
             Hãy bổ sung hồ sơ sự cố hoặc tài liệu liên quan.</div>`;
      qs('#deep-ask', box)?.addEventListener('click', () => navigate('/tro-ly', { q: question }));
    } catch (err) {
      box.innerHTML = errorState(err.message);
    }
  });

  async function load() {
    list.innerHTML = loading();
    try {
      const data = await api.incidents({
        q: filters[0].value.trim(),
        severity: filters[1].value,
        source: filters[2].value,
        equipment_id: filters[3].value,
      });
      list.innerHTML = data.items.length
        ? `<div class="list">${data.items.map(row).join('')}</div>
           <div class="text-muted" style="margin-top:14px">${data.total} hồ sơ</div>`
        : emptyState({
            iconName: 'incident',
            title: 'Chưa có hồ sơ sự cố nào',
            text: 'Ghi nhận các tình huống đã gặp và bài học từ nhà máy khác để ca sau tra cứu được ngay.',
          });
    } catch (err) {
      list.innerHTML = errorState(err.message);
    }
  }

  load();
}

function row(item) {
  const [sevCls, sevLabel] = SEVERITY[item.severity] || SEVERITY.trung_binh;
  const [srcCls, srcLabel] = SOURCE[item.source] || SOURCE.quy_trinh;
  return `
    <a class="row-card" href="#/su-co/${item.id}">
      <span class="thumb" style="background:var(--red-soft);color:var(--red)">${icon('incident', 18)}</span>
      <div class="row-body">
        <div class="row-title">${esc(item.title)}</div>
        <div class="row-meta">
          ${item.code ? `<span class="mono">${esc(item.code)}</span>` : ''}
          ${item.equipment_name ? `<span>${icon('equipment', 13)} ${esc(item.equipment_name)}</span>` : ''}
          <span>${item.actions.length} bước xử lý</span>
          <span>${esc(formatDateTime(item.updated_at))}</span>
        </div>
        ${item.symptoms.length ? `<div class="row-desc">${icon('search', 13)}
          Hiện tượng: ${esc(item.symptoms.slice(0, 2).join('; '))}</div>` : ''}
      </div>
      <div class="row-side" style="flex-direction:column;align-items:flex-end;gap:5px">
        <span class="badge ${sevCls}">${esc(sevLabel)}</span>
        <span class="badge ${srcCls}">${esc(srcLabel)}</span>
      </div>
    </a>`;
}

function openEditor(existing, equipmentItems, onDone) {
  openModal({
    title: existing ? `Sửa hồ sơ: ${existing.title}` : 'Thêm hồ sơ sự cố / bất thường',
    wide: true,
    body: `
      <form id="inc-form">
        <div class="field-row">
          <div class="field">
            <label>Tên sự cố / bất thường *</label>
            <input class="input" name="title" required value="${esc(existing?.title || '')}"
                   placeholder="VD: Nhiệt độ gối trục hướng máy phát tăng cao">
          </div>
          <div class="field">
            <label>Mã hồ sơ</label>
            <input class="input" name="code" value="${esc(existing?.code || '')}" placeholder="VD: SC-2024-07">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Thiết bị</label>
            <select class="select" name="equipment_id">
              <option value="">— Không gắn thiết bị —</option>
              ${equipmentItems.map((e) => `<option value="${e.id}"
                ${existing?.equipment_id === e.id ? 'selected' : ''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Mức độ</label>
            <select class="select" name="severity">
              ${Object.entries(SEVERITY).map(([value, [, label]]) => `<option value="${value}"
                ${existing?.severity === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Nguồn</label>
            <select class="select" name="source">
              ${Object.entries(SOURCE).map(([value, [, label]]) => `<option value="${value}"
                ${existing?.source === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Hiện tượng, dấu hiệu nhận biết</label>
          <div id="symptoms"></div>
        </div>
        <div class="field">
          <label>Nguyên nhân có thể</label>
          <div id="causes"></div>
        </div>
        <div class="field">
          <label>Trình tự xử lý <span class="hint">(theo đúng thứ tự thao tác)</span></label>
          <div id="actions"></div>
        </div>
        <div class="field">
          <label>Biện pháp phòng ngừa</label>
          <textarea class="textarea" name="prevention" style="min-height:56px">${esc(existing?.prevention || '')}</textarea>
        </div>
        <div class="field">
          <label>Bài học kinh nghiệm</label>
          <textarea class="textarea" name="lesson" style="min-height:56px">${esc(existing?.lesson || '')}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Ngày xảy ra</label>
            <input class="input" type="date" name="occurred_at" value="${esc(existing?.occurred_at || '')}">
          </div>
          <div class="field">
            <label>Thẻ</label>
            <input class="input" name="tags" value="${esc(existing?.tags || '')}"
                   placeholder="gối trục, nhiệt độ, làm mát">
          </div>
        </div>
        <div class="field">
          <label>Căn cứ / nguồn tham khảo</label>
          <input class="input" name="source_ref" value="${esc(existing?.source_ref || '')}"
                 placeholder="VD: Quy trình xử lý sự cố NMTĐ Hủa Na, Điều 32">
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-save">${icon('check', 16)}Lưu hồ sơ</button>`,
    onMount(root, close) {
      const symptoms = repeatList(qs('#symptoms', root), {
        values: existing?.symptoms || [],
        placeholder: 'VD: Tín hiệu cảnh báo nhiệt độ gối trục > 65°C trên HMI',
      });
      const causes = repeatList(qs('#causes', root), {
        values: existing?.causes || [],
        placeholder: 'VD: Lưu lượng nước làm mát giảm do tắc lọc',
      });
      const actions = repeatList(qs('#actions', root), {
        values: existing?.actions || [],
        placeholder: 'VD: Kiểm tra áp lực và lưu lượng nước làm mát gối trục',
      });

      qs('#do-save', root).addEventListener('click', async (e) => {
        const form = qs('#inc-form', root);
        if (!form.reportValidity()) return;
        e.target.disabled = true;
        const raw = Object.fromEntries(new FormData(form));
        const payload = {
          ...raw,
          equipment_id: raw.equipment_id ? Number(raw.equipment_id) : null,
          symptoms: symptoms.value(),
          causes: causes.value(),
          actions: actions.value(),
        };
        try {
          if (existing) await api.put(`/api/incidents/${existing.id}`, payload);
          else await api.post('/api/incidents', payload);
          close();
          toast('Đã lưu hồ sơ và cập nhật chỉ mục tra cứu', 'success');
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
  let inc;
  let equipment;
  try {
    [inc, equipment] = await Promise.all([api.incident(id), api.equipmentList()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  const [sevCls, sevLabel] = SEVERITY[inc.severity] || SEVERITY.trung_binh;
  const [srcCls, srcLabel] = SOURCE[inc.source] || SOURCE.quy_trinh;

  setPage({
    title: inc.title,
    subtitle: [inc.code, inc.equipment_name].filter(Boolean).join(' · '),
    actions: `
      <button class="btn btn-sm" data-back>${icon('chevronLeft', 15)}Danh sách</button>
      <button class="btn btn-sm" id="print-btn">${icon('printer', 15)}In phiếu</button>
      <button class="btn btn-sm" id="edit-btn">${icon('edit', 15)}Sửa</button>
      <button class="btn btn-sm btn-danger" id="del-btn">${icon('trash', 15)}Xoá</button>`,
  });

  root.innerHTML = `
    <div class="grid two-col">
      <div style="display:flex;flex-direction:column;gap:16px">
        ${inc.symptoms.length ? `
        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--amber-soft);color:var(--amber)">${icon('search', 18)}</span>
            <h2 class="card-title">Hiện tượng, dấu hiệu nhận biết</h2>
          </div>
          <ul class="bullet-list">${inc.symptoms.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </section>` : ''}

        ${inc.causes.length ? `
        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--violet-soft);color:var(--violet)">${icon('layers', 18)}</span>
            <h2 class="card-title">Nguyên nhân có thể</h2>
          </div>
          <ul class="bullet-list">${inc.causes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </section>` : ''}

        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--green-soft);color:var(--green)">${icon('operations', 18)}</span>
            <h2 class="card-title">Trình tự xử lý</h2>
            <div class="card-actions"><span class="badge badge-grey">${inc.actions.length} bước</span></div>
          </div>
          ${inc.actions.length ? `<ol class="step-list">${inc.actions.map((a, i) => `
            <li><span class="step-no">${i + 1}</span><div class="step-text">${esc(a)}</div></li>`).join('')}</ol>`
            : '<p class="text-muted" style="margin:0">Chưa ghi nhận trình tự xử lý.</p>'}
        </section>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Phân loại</h2></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
            <span class="badge ${sevCls}">${esc(sevLabel)}</span>
            <span class="badge ${srcCls}">${esc(srcLabel)}</span>
          </div>
          <dl class="kv" style="grid-template-columns:120px 1fr">
            ${inc.equipment_name ? `<dt>Thiết bị</dt><dd>
              <a href="#/thiet-bi/${inc.equipment_id}">${esc(inc.equipment_name)}</a></dd>` : ''}
            ${inc.occurred_at ? `<dt>Ngày xảy ra</dt><dd>${esc(inc.occurred_at)}</dd>` : ''}
            ${inc.tags ? `<dt>Thẻ</dt><dd>${esc(inc.tags)}</dd>` : ''}
            ${inc.source_ref ? `<dt>Căn cứ</dt><dd>${esc(inc.source_ref)}</dd>` : ''}
            <dt>Cập nhật</dt><dd>${esc(formatDateTime(inc.updated_at))}</dd>
          </dl>
        </section>

        ${inc.prevention ? `
        <section class="card">
          <div class="card-head"><h2 class="card-title">Biện pháp phòng ngừa</h2></div>
          <div class="callout callout-info">${esc(inc.prevention)}</div>
        </section>` : ''}

        ${inc.lesson ? `
        <section class="card">
          <div class="card-head"><h2 class="card-title">Bài học kinh nghiệm</h2></div>
          <div class="callout">${esc(inc.lesson)}</div>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2 class="card-title">Tra cứu</h2></div>
          <button class="btn btn-primary" style="width:100%" id="ask-about">
            ${icon('assistant', 16)}Hỏi trợ lý về tình huống này
          </button>
        </section>
      </div>
    </div>`;

  document.querySelector('[data-back]').addEventListener('click', () => navigate('/su-co'));
  document.querySelector('#print-btn').addEventListener('click', () => printIncident(inc));
  document.querySelector('#edit-btn').addEventListener('click', () => {
    openEditor(inc, equipment.items, () => renderDetail(root, id));
  });
  document.querySelector('#del-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(`Xoá hồ sơ "${inc.title}"?`, { title: 'Xoá hồ sơ sự cố' });
    if (!ok) return;
    try {
      await api.del(`/api/incidents/${id}`);
      toast('Đã xoá hồ sơ', 'success');
      navigate('/su-co');
    } catch (err) { toast(err.message, 'error'); }
  });
  qs('#ask-about', root).addEventListener('click', () => navigate('/tro-ly', { q: inc.title }));
}
