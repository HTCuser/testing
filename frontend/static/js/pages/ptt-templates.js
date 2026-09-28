import { api } from '../api.js';
import { icon } from '../icons.js';
import { isStale, setPage } from '../shell.js';
import { createStepGrid, importListsInto } from '../stepgrid.js';
import { confirmDialog, errorState, esc, loading, openModal, qs, toast } from '../ui.js';

// Phiếu thao tác mẫu, bố cục như NKVH điện tử: Nhóm | Tên phiếu | bảng bước.

const API = '/api/ptt';

export const meta = {
  title: 'Phiếu thao tác mẫu',
  subtitle: 'Nhóm phiếu → tên phiếu → trình tự các bước. Lập phiếu thao tác từ các mẫu này',
};

export async function render(root, ctx) {
  setPage({ ...meta });
  root.innerHTML = loading();

  let groups;
  let hints;
  try {
    [groups, hints] = await Promise.all([api.get(`${API}/nhom`), api.get(`${API}/goi-y`)]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  // Liên kết chỉ có ?mau= (vd. từ trích dẫn của trợ lý): tự tìm nhóm của mẫu.
  let groupFromTemplate = null;
  if (ctx.query.mau && !ctx.query.nhom) {
    groupFromTemplate = await api.get(`${API}/mau/${ctx.query.mau}`).then((t) => t.group_id).catch(() => null);
  }
  const state = {
    groups: groups.items,
    groupId: Number(ctx.query.nhom) || groupFromTemplate || groups.items[0]?.id || null,
    templates: [],
    templateId: Number(ctx.query.mau) || null,
    current: null,
    grid: null,
    fieldsDirty: false,
  };

  root.innerHTML = `
    <div class="ptt-panes">
      <section class="card ptt-pane">
        <div class="pane-head">
          <input class="input" id="g-filter" placeholder="Lọc nhóm…">
          <button class="btn btn-sm btn-primary" id="g-add" title="Thêm nhóm">${icon('plus', 16)}</button>
        </div>
        <div class="pane-title">Nhóm</div>
        <div id="g-list" class="pane-list"></div>
      </section>
      <section class="card ptt-pane">
        <div class="pane-head">
          <input class="input" id="t-filter" placeholder="Lọc tên phiếu…">
          <button class="btn btn-sm btn-primary" id="t-add" title="Thêm phiếu mẫu vào nhóm đang chọn">${icon('plus', 16)}</button>
        </div>
        <div class="pane-title">Tên phiếu</div>
        <div id="t-list" class="pane-list"></div>
      </section>
      <section class="card" id="editor"></section>
    </div>`;

  const gList = qs('#g-list', root);
  const tList = qs('#t-list', root);
  const editor = qs('#editor', root);

  const dirty = () => state.fieldsDirty || state.grid?.isDirty();
  async function leaveOk() {
    if (!dirty()) return true;
    return confirmDialog('Phiếu mẫu đang sửa chưa ghi. Bỏ các thay đổi?', { title: 'Chưa ghi' });
  }
  function syncUrl() {
    const q = new URLSearchParams();
    if (state.groupId) q.set('nhom', state.groupId);
    if (state.templateId) q.set('mau', state.templateId);
    history.replaceState(null, '', `#/ptt-mau?${q}`);
  }

  // ------------------------------------------------------------ nhóm
  function renderGroups() {
    const f = qs('#g-filter', root).value.trim().toLowerCase();
    const items = state.groups.filter((g) => !f || g.name.toLowerCase().includes(f));
    gList.innerHTML = items.length ? items.map((g) => `
      <div class="pane-item ${g.id === state.groupId ? 'active' : ''}" data-group="${g.id}">
        <span>${esc(g.name)} <span class="text-muted" style="font-size:12px">(${g.n_templates})</span></span>
        <button class="btn btn-icon btn-sm" data-edit-group="${g.id}" title="Sửa nhóm">${icon('edit', 14)}</button>
      </div>`).join('') : '<p class="text-muted" style="padding:10px">Chưa có nhóm.</p>';
  }
  async function reloadGroups() {
    state.groups = (await api.get(`${API}/nhom`)).items;
    renderGroups();
  }
  qs('#g-filter', root).addEventListener('input', renderGroups);
  gList.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-group]');
    if (edit) { e.stopPropagation(); editGroup(state.groups.find((g) => g.id === Number(edit.dataset.editGroup))); return; }
    const item = e.target.closest('[data-group]');
    if (!item || Number(item.dataset.group) === state.groupId || !(await leaveOk())) return;
    state.groupId = Number(item.dataset.group);
    state.templateId = null;
    renderGroups();
    await loadTemplates();
    showEditor(null);
    syncUrl();
  });
  qs('#g-add', root).addEventListener('click', () => nameDialog('Thêm nhóm phiếu mẫu', '', async (name) => {
    const g = await api.post(`${API}/nhom`, { name });
    state.groupId = g.id;
    state.templateId = null;
    await reloadGroups();
    await loadTemplates();
    showEditor(null);
    syncUrl();
  }, 'VD: PTT MẪU TỔ MÁY H1'));

  function editGroup(g) {
    openModal({
      title: 'Sửa nhóm',
      body: `<div class="field"><label>Tên nhóm</label><input class="input" id="gname" value="${esc(g.name)}"></div>
             <p class="text-muted" style="font-size:12.5px">Chỉ xoá được nhóm không còn phiếu mẫu nào.</p>`,
      footer: `<button class="btn btn-danger" id="gdel">${icon('trash', 15)}Xoá nhóm</button>
               <button class="btn" data-close style="margin-left:auto">Huỷ</button>
               <button class="btn btn-primary" id="gsave">${icon('check', 15)}Lưu</button>`,
      onMount(m, close) {
        qs('#gsave', m).addEventListener('click', async () => {
          try {
            await api.put(`${API}/nhom/${g.id}`, { name: qs('#gname', m).value.trim() });
            close(); reloadGroups(); loadTemplates();
          } catch (err) { toast(err.message, 'error'); }
        });
        qs('#gdel', m).addEventListener('click', async () => {
          try {
            await api.del(`${API}/nhom/${g.id}`);
            close();
            if (state.groupId === g.id) { state.groupId = null; state.templateId = null; }
            await reloadGroups();
            state.groupId = state.groupId || state.groups[0]?.id || null;
            renderGroups(); await loadTemplates(); showEditor(null); syncUrl();
          } catch (err) { toast(err.message, 'error', 8000); }
        });
      },
    });
  }

  // ------------------------------------------------------------ tên phiếu
  function renderTemplates() {
    const f = qs('#t-filter', root).value.trim().toLowerCase();
    const items = state.templates.filter((t) => !f || t.name.toLowerCase().includes(f));
    tList.innerHTML = !state.groupId
      ? '<p class="text-muted" style="padding:10px">Chọn một nhóm.</p>'
      : items.length ? items.map((t) => `
        <div class="pane-item ${t.id === state.templateId ? 'active' : ''}" data-tpl="${t.id}">
          <span>${esc(t.name)} <span class="text-muted" style="font-size:12px">· ${t.n_steps} bước</span></span>
          <button class="btn btn-icon btn-sm" data-edit-tpl="${t.id}" title="Đổi tên, chuyển nhóm, sao chép, xoá">${icon('edit', 14)}</button>
        </div>`).join('')
        : '<p class="text-muted" style="padding:10px">Nhóm chưa có phiếu mẫu. Bấm + để thêm.</p>';
  }
  async function loadTemplates() {
    state.templates = state.groupId ? (await api.get(`${API}/mau`, { nhom: state.groupId })).items : [];
    renderTemplates();
  }
  qs('#t-filter', root).addEventListener('input', renderTemplates);
  tList.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-tpl]');
    if (edit) { e.stopPropagation(); editTemplateMeta(Number(edit.dataset.editTpl)); return; }
    const item = e.target.closest('[data-tpl]');
    if (!item || Number(item.dataset.tpl) === state.templateId || !(await leaveOk())) return;
    state.templateId = Number(item.dataset.tpl);
    renderTemplates();
    await showEditor(state.templateId);
    syncUrl();
  });
  qs('#t-add', root).addEventListener('click', () => {
    if (!state.groupId) { toast('Chọn nhóm trước', 'info'); return; }
    nameDialog('Thêm phiếu mẫu', '', async (name) => {
      const t = await api.post(`${API}/mau`, { group_id: state.groupId, name, steps: [] });
      state.templateId = t.id;
      await loadTemplates(); await reloadGroups();
      await showEditor(t.id);
      syncUrl();
    }, 'VD: Đóng điện tủ điều khiển cửa van sự cố H2');
  });

  function editTemplateMeta(id) {
    const t = state.templates.find((x) => x.id === id);
    openModal({
      title: 'Phiếu mẫu',
      body: `
        <div class="field"><label>Tên phiếu</label><input class="input" id="tname" value="${esc(t.name)}"></div>
        <div class="field"><label>Thuộc nhóm</label><select class="select" id="tgroup">
          ${state.groups.map((g) => `<option value="${g.id}" ${g.id === t.group_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select></div>`,
      footer: `<button class="btn btn-danger" id="tdel">${icon('trash', 15)}Xoá</button>
               <button class="btn" id="tcopy">${icon('copy', 15)}Sao chép</button>
               <button class="btn" data-close style="margin-left:auto">Huỷ</button>
               <button class="btn btn-primary" id="tsave">${icon('check', 15)}Lưu</button>`,
      onMount(m, close) {
        qs('#tsave', m).addEventListener('click', async () => {
          try {
            const full = await api.get(`${API}/mau/${id}`);
            await api.put(`${API}/mau/${id}`, { ...full, name: qs('#tname', m).value.trim(), group_id: Number(qs('#tgroup', m).value) });
            close();
            await reloadGroups(); await loadTemplates();
            if (state.templateId === id) showEditor(id);
          } catch (err) { toast(err.message, 'error'); }
        });
        qs('#tcopy', m).addEventListener('click', async () => {
          const copy = await api.post(`${API}/mau/${id}/sao-chep`, {});
          close();
          state.templateId = copy.id;
          await reloadGroups(); await loadTemplates(); showEditor(copy.id); syncUrl();
          toast('Đã sao chép. Sửa lại tên và các bước cho phiếu mới.', 'success');
        });
        qs('#tdel', m).addEventListener('click', async () => {
          close();
          if (!(await confirmDialog(`Xoá phiếu mẫu "${t.name}"? Các phiếu đã lập từ mẫu này không bị ảnh hưởng.`, { title: 'Xoá phiếu mẫu' }))) return;
          await api.del(`${API}/mau/${id}`);
          if (state.templateId === id) { state.templateId = null; showEditor(null); }
          await reloadGroups(); await loadTemplates(); syncUrl();
        });
      },
    });
  }

  // ------------------------------------------------------------ bảng bước
  async function showEditor(id) {
    state.grid = null;
    state.fieldsDirty = false;
    if (!id) {
      editor.innerHTML = `<div class="empty" style="padding:40px 10px">${icon('forms', 40)}
        <h3>Chọn một phiếu mẫu</h3><p>Chọn nhóm rồi chọn tên phiếu để xem và sửa trình tự các bước.</p></div>`;
      return;
    }
    editor.innerHTML = loading();
    let t;
    try {
      t = await api.get(`${API}/mau/${id}`);
    } catch (err) {
      editor.innerHTML = errorState(err.message);
      return;
    }
    state.current = t;
    editor.innerHTML = `
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <h2 class="card-title" style="flex:1 1 260px">${esc(t.name)}</h2>
        <div class="card-actions">
          <span class="badge badge-amber" id="unsaved" hidden>Chưa ghi</span>
          <a class="btn btn-sm" href="#/phieu-thao-tac/moi?mau=${t.id}">${icon('plus', 15)}Lập phiếu từ mẫu này</a>
          <button class="btn btn-sm btn-primary" id="save">${icon('check', 15)}Ghi</button>
        </div>
      </div>
      <form id="tpl-form" onsubmit="return false">
        <div class="field-row">
          <div class="field"><label>Tên phiếu</label><input class="input" name="name" value="${esc(t.name)}" required></div>
          <div class="field"><label>Mục đích</label><input class="input" name="purpose" value="${esc(t.purpose)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Điều kiện cần để thực hiện <span class="hint">(mỗi dòng một ý)</span></label>
            <textarea class="textarea" name="conditions" style="min-height:80px">${esc(t.conditions)}</textarea></div>
          <div class="field"><label>Lưu ý <span class="hint">(mỗi dòng một ý)</span></label>
            <textarea class="textarea" name="notes" style="min-height:80px">${esc(t.notes)}</textarea></div>
        </div>
      </form>
      <div id="grid"></div>`;
    const badge = qs('#unsaved', editor);
    const markDirty = () => { badge.hidden = false; };
    qs('#tpl-form', editor).addEventListener('input', () => { state.fieldsDirty = true; markDirty(); });
    state.grid = createStepGrid(qs('#grid', editor), t.steps, {
      onChange: markDirty, locations: hints.locations,
      onImport: (data, replace) => importListsInto(qs('#tpl-form', editor), data, replace),
    });
    qs('#save', editor).addEventListener('click', async () => {
      const form = qs('#tpl-form', editor);
      if (!form.reportValidity()) return;
      const data = Object.fromEntries(new FormData(form));
      try {
        const saved = await api.put(`${API}/mau/${t.id}`, { ...data, group_id: t.group_id, steps: state.grid.getSteps() });
        state.grid.setSteps(saved.steps);
        state.fieldsDirty = false;
        badge.hidden = true;
        qs('.card-title', editor).textContent = saved.name;
        toast(`Đã ghi ${saved.steps.length} bước`, 'success');
        await loadTemplates(); await reloadGroups();
      } catch (err) { toast(err.message, 'error', 8000); }
    });
  }

  renderGroups();
  await loadTemplates();
  if (state.templateId && !state.templates.some((t) => t.id === state.templateId)) state.templateId = null;
  renderTemplates();
  await showEditor(state.templateId);
}

function nameDialog(title, value, onSave, placeholder = '') {
  openModal({
    title,
    body: `<div class="field"><label>Tên</label><input class="input" id="nd-name" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
    footer: `<button class="btn" data-close>Huỷ</button><button class="btn btn-primary" id="nd-save">${icon('check', 15)}Lưu</button>`,
    onMount(m, close) {
      const input = qs('#nd-name', m);
      input.focus();
      const save = async () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        try { await onSave(name); close(); } catch (err) { toast(err.message, 'error'); }
      };
      qs('#nd-save', m).addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    },
  });
}

