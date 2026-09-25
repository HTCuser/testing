import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, formatDateTime, loading, qs, qsa, toast,
} from '../ui.js';

// Nhật ký nghiệp vụ do vận hành viên ghi: thao tác vận hành, bảo dưỡng sửa
// chữa. Hai trang dùng chung một module, khác nhau ở `kind` và các nhãn.

const API = '/api/nhat-ky';
let labelsCache = null;

async function labelsFor(kind) {
  if (!labelsCache) labelsCache = await api.get(`${API}/nhan`);
  return labelsCache[kind];
}

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function viTime(value) {
  if (!value) return '';
  const [day, time] = value.split('T');
  const [y, m, d] = day.split('-');
  return `${time ? time.slice(0, 5) + ' ' : ''}${d}/${m}/${y}`;
}

function viDay(day) {
  const [y, m, d] = day.split('-');
  const weekday = new Date(`${day}T00:00`).toLocaleDateString('vi-VN', { weekday: 'long' });
  return `${weekday}, ${d}/${m}/${y}`;
}

export function createJournalPage({ kind, basePath, title, subtitle, addLabel, placeholder }) {
  const meta = { title, subtitle };

  async function render(root, ctx) {
    const path = window.location.hash.replace(/^#/, '').split('?')[0];
    if (path === `${basePath}/moi`) return renderEditor(root, null);
    if (ctx.params.id && path.endsWith('/sua')) return renderEditor(root, Number(ctx.params.id));
    if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));
    return renderList(root, ctx);
  }

  // ---------------------------------------------------------- danh sách

  async function renderList(root, ctx) {
    setPage({
      ...meta,
      actions: `<a class="btn btn-accent" href="#${basePath}/moi">${icon('plus', 16)}${esc(addLabel)}</a>`,
    });
    root.innerHTML = loading();
    let equipment;
    try {
      equipment = await api.equipmentList();
    } catch (err) {
      root.innerHTML = errorState(err.message);
      return;
    }
    if (isStale(root)) return;

    root.innerHTML = `
      <div class="toolbar">
        <div class="search">
          ${icon('search', 17)}
          <input class="input" id="j-q" placeholder="${esc(placeholder)}" value="${esc(ctx.query.q || '')}">
        </div>
        <select class="select" id="j-eq">
          <option value="">Mọi thiết bị</option>
          ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
        </select>
        <label class="text-muted" style="font-size:12.5px">Từ
          <input class="input" type="date" id="j-from" style="width:auto;display:inline-block"></label>
        <label class="text-muted" style="font-size:12.5px">đến
          <input class="input" type="date" id="j-to" style="width:auto;display:inline-block"></label>
      </div>
      <div id="j-list"></div>`;

    const list = qs('#j-list', root);
    const inputs = ['#j-q', '#j-eq', '#j-from', '#j-to'].map((s) => qs(s, root));
    let timer;
    inputs.forEach((el) => el.addEventListener(el.id === 'j-q' ? 'input' : 'change', () => {
      clearTimeout(timer);
      timer = setTimeout(load, el.id === 'j-q' ? 250 : 0);
    }));

    async function load() {
      list.innerHTML = loading();
      try {
        const data = await api.get(API, {
          kind, q: inputs[0].value.trim(), equipment_id: inputs[1].value,
          tu_ngay: inputs[2].value, den_ngay: inputs[3].value,
        });
        if (!data.items.length) {
          list.innerHTML = emptyState({
            iconName: 'file',
            title: 'Chưa có bản ghi phù hợp',
            text: 'Ghi lại sau mỗi lần thực hiện: nội dung, người làm, bất thường gặp phải. '
              + 'Trợ lý kỹ thuật sẽ tra cứu được các bản ghi này.',
          });
          return;
        }
        // Gom theo ngày như sổ nhật ký giấy.
        const byDay = new Map();
        data.items.forEach((it) => {
          const day = (it.started_at || it.created_at || '').slice(0, 10) || 'Không rõ ngày';
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push(it);
        });
        list.innerHTML = [...byDay.entries()].map(([day, items]) => `
          <div class="section-title" style="margin:16px 0 8px">${esc(/^\d{4}-/.test(day) ? viDay(day) : day)}</div>
          <div class="list">${items.map(row).join('')}</div>`).join('')
          + `<div class="text-muted" style="margin-top:14px">${data.total} bản ghi</div>`;
      } catch (err) {
        list.innerHTML = errorState(err.message);
      }
    }
    load();
  }

  function row(it) {
    const time = (it.started_at || '').split('T')[1]?.slice(0, 5);
    const end = (it.finished_at || '').split('T')[1]?.slice(0, 5);
    return `
      <a class="row-card" href="#${basePath}/${it.id}">
        <span class="thumb" style="background:var(--teal-soft);color:var(--teal);font-size:12px;font-weight:700;width:auto;padding:0 9px">
          ${esc(time || '—')}${end ? `–${esc(end)}` : ''}</span>
        <div class="row-body">
          <div class="row-title">${esc(it.title)}</div>
          <div class="row-meta">
            ${it.equipment_name ? `<span>${icon('equipment', 13)} ${esc(it.equipment_name)}</span>` : ''}
            ${it.shift ? `<span>${icon('clock', 13)} ${esc(it.shift)}</span>` : ''}
            ${it.performers ? `<span>${icon('user', 13)} ${esc(it.performers)}</span>` : ''}
            ${it.ref ? `<span class="mono">${esc(it.ref)}</span>` : ''}
          </div>
          ${it.notes ? `<div class="row-desc">${icon('zap', 13)} ${esc(it.notes.slice(0, 160))}${it.notes.length > 160 ? '…' : ''}</div>` : ''}
        </div>
      </a>`;
  }

  // ---------------------------------------------------------- chi tiết

  async function renderDetail(root, id) {
    root.innerHTML = loading();
    let it;
    let L;
    try {
      [it, L] = await Promise.all([api.get(`${API}/${id}`), labelsFor(kind)]);
    } catch (err) {
      root.innerHTML = errorState(err.message);
      return;
    }
    if (isStale(root)) return;

    setPage({
      title: it.title,
      subtitle: `${title} · ${viTime(it.started_at)}`,
      actions: `
        <a class="btn btn-sm" href="#${basePath}">${icon('chevronLeft', 15)}${esc(title)}</a>
        <a class="btn btn-sm" href="#${basePath}/${id}/sua">${icon('edit', 15)}Sửa</a>
        <button class="btn btn-sm btn-danger" id="del">${icon('trash', 15)}Xoá</button>`,
    });

    const block = (key) => (it[key] && L[key] ? `
      <div class="section-title" style="margin-top:18px">${esc(L[key])}</div>
      <div style="white-space:pre-wrap;line-height:1.75">${esc(it[key])}</div>` : '');
    const refHtml = it.ticket_id
      ? `<a href="#/phieu-thao-tac/${it.ticket_id}" class="mono">${esc(it.ref)}</a>`
      : `<span class="mono">${esc(it.ref)}</span>`;

    root.innerHTML = `
      <div class="grid two-col">
        <section class="card">
          ${block('details') || '<p class="text-muted">Chưa ghi diễn biến.</p>'}
          ${block('materials')}
          ${block('result')}
          ${it.notes ? `<div class="callout" style="margin-top:18px">
            <b>${esc(L.notes)}</b><div style="white-space:pre-wrap;margin-top:6px;line-height:1.7">${esc(it.notes)}</div></div>` : ''}
        </section>
        <section class="card">
          <dl class="kv">
            <dt>Bắt đầu</dt><dd>${esc(viTime(it.started_at) || '—')}</dd>
            <dt>Kết thúc</dt><dd>${esc(viTime(it.finished_at) || '—')}</dd>
            ${it.shift ? `<dt>Ca, kíp</dt><dd>${esc(it.shift)}</dd>` : ''}
            ${it.equipment_name ? `<dt>Thiết bị</dt><dd><a href="#/thiet-bi/${it.equipment_id}">${esc(it.equipment_name)}</a></dd>` : ''}
            ${it.ref ? `<dt>${esc(L.ref)}</dt><dd>${refHtml}</dd>` : ''}
            ${it.leader ? `<dt>${esc(L.leader)}</dt><dd>${esc(it.leader)}</dd>` : ''}
            ${it.performers ? `<dt>${esc(L.performers)}</dt><dd>${esc(it.performers)}</dd>` : ''}
            ${it.tags ? `<dt>Thẻ</dt><dd>${esc(it.tags)}</dd>` : ''}
            <dt>Ghi lúc</dt><dd>${esc(formatDateTime(it.created_at))}</dd>
          </dl>
        </section>
      </div>`;

    qs('#del').addEventListener('click', async () => {
      const ok = await confirmDialog('Xoá bản ghi này? Trợ lý sẽ không tra cứu được nó nữa.', { title: 'Xoá bản ghi' });
      if (!ok) return;
      try {
        await api.del(`${API}/${id}`);
        toast('Đã xoá', 'success');
        navigate(basePath);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---------------------------------------------------------- nhập liệu

  async function renderEditor(root, id) {
    root.innerHTML = loading();
    let it = {};
    let L;
    let equipment;
    let hints;
    try {
      [L, equipment, hints, it] = await Promise.all([
        labelsFor(kind), api.equipmentList(), api.get(`${API}/goi-y`, { kind }),
        id ? api.get(`${API}/${id}`) : Promise.resolve({}),
      ]);
    } catch (err) {
      root.innerHTML = errorState(err.message);
      return;
    }
    if (isStale(root)) return;

    setPage({
      title: id ? `Sửa: ${it.title}` : addLabel.charAt(0) + addLabel.slice(1).toLowerCase(),
      subtitle: title,
      actions: `<a class="btn btn-sm" href="#${id ? `${basePath}/${id}` : basePath}">${icon('chevronLeft', 15)}Quay lại</a>`,
    });

    const list = (name, values) => (values?.length
      ? `<datalist id="dl-${name}">${values.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>` : '');
    const text = (name, label, attrs = '') => `
      <div class="field"><label>${esc(label)}</label>
        <input class="input" name="${name}" value="${esc(it[name] || '')}" ${hints[name]?.length ? `list="dl-${name}"` : ''} ${attrs}>
        ${list(name, hints[name])}</div>`;
    const area = (name, label, rows = 4) => (label ? `
      <div class="field"><label>${esc(label)}</label>
        <textarea class="textarea" name="${name}" style="min-height:${rows * 24}px">${esc(it[name] || '')}</textarea></div>` : '');

    root.innerHTML = `
      <form id="j-form" class="grid two-col" onsubmit="return false">
        <section class="card">
          <div class="field"><label>Nội dung tóm tắt <span class="hint">(bắt buộc)</span></label>
            <input class="input" name="title" required maxlength="255" value="${esc(it.title || '')}"
                   placeholder="${kind === 'thao_tac' ? 'VD: Đưa MBA T2-TD92 vào làm việc' : 'VD: Thay gioăng làm kín xilanh cửa van cung số 2'}"></div>
          ${area('details', L.details, 6)}
          ${area('materials', L.materials, 3)}
          ${area('result', L.result, 2)}
          ${area('notes', L.notes, 3)}
        </section>
        <section class="card">
          <div class="field-row">
            <div class="field"><label>Bắt đầu</label>
              <input class="input" type="datetime-local" name="started_at" required value="${esc(it.started_at || nowLocal())}"></div>
            <div class="field"><label>Kết thúc</label>
              <input class="input" type="datetime-local" name="finished_at" value="${esc(it.finished_at || '')}"></div>
          </div>
          ${text('shift', 'Ca, kíp')}
          <div class="field"><label>Thiết bị</label>
            <select class="select" name="equipment_id">
              <option value="">— Không gắn thiết bị —</option>
              ${equipment.items.map((e) => `<option value="${e.id}" ${e.id === it.equipment_id ? 'selected' : ''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
            </select></div>
          ${text('ref', L.ref)}
          ${text('leader', L.leader)}
          ${text('performers', L.performers)}
          ${text('tags', 'Thẻ (cách nhau bằng dấu phẩy)')}
          <button class="btn btn-primary" id="j-save" style="width:100%">${icon('check', 16)}Lưu</button>
        </section>
      </form>`;

    qs('#j-save', root).addEventListener('click', async (e) => {
      const form = qs('#j-form', root);
      if (!form.reportValidity()) return;
      const data = Object.fromEntries(new FormData(form));
      data.equipment_id = data.equipment_id ? Number(data.equipment_id) : null;
      Object.keys(data).forEach((k) => { if (typeof data[k] === 'string') data[k] = data[k].trim(); });
      e.currentTarget.disabled = true;
      try {
        const saved = id
          ? await api.put(`${API}/${id}`, data)
          : await api.post(`${API}?kind=${kind}`, data);
        toast('Đã lưu. Trợ lý kỹ thuật tra cứu được bản ghi này.', 'success');
        navigate(`${basePath}/${saved.id}`);
      } catch (err) {
        toast(err.message, 'error');
        e.currentTarget.disabled = false;
      }
    });
    qsa('textarea', root)[0]?.focus();
  }

  return { meta, render };
}
