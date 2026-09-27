import { api } from './api.js';
import { icon } from './icons.js';
import { confirmDialog, esc, qs, qsa, toast } from './ui.js';

// Bảng bước thao tác kiểu NKVH: Mục | Địa điểm | Bước | Nội dung.
// Dùng chung cho PTT mẫu và phiếu đang soạn. Số bước tự đánh liên tục theo
// thứ tự dòng — không để người nhập gõ tay rồi lệch số.

export function createStepGrid(container, initial = [], { onChange = () => {}, locations = [] } = {}) {
  let steps = initial.map((s) => ({ section: s.section || '', location: s.location || '', content: s.content || '' }));
  let dirty = false;

  container.innerHTML = `
    <div class="toolbar" style="margin-bottom:10px;align-items:center">
      <label class="btn btn-sm btn-primary" style="cursor:pointer">${icon('upload', 15)}Import Excel
        <input type="file" accept=".xlsx,.xlsm" data-g="excel" hidden></label>
      <button class="btn btn-sm btn-primary" data-g="add" type="button">${icon('plus', 15)}Thêm</button>
      <button class="btn btn-sm btn-danger" data-g="del" type="button">${icon('trash', 15)}Xoá</button>
      <span style="margin-left:auto;display:flex;gap:4px">
        <button class="btn btn-sm" data-g="top" type="button" title="Đưa các dòng chọn lên đầu">⤒</button>
        <button class="btn btn-sm" data-g="up" type="button" title="Lên một dòng">↑</button>
        <button class="btn btn-sm" data-g="down" type="button" title="Xuống một dòng">↓</button>
        <button class="btn btn-sm" data-g="bottom" type="button" title="Xuống cuối">⤓</button>
      </span>
    </div>
    <datalist id="grid-locations">${locations.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
    <div style="overflow-x:auto">
      <table class="table step-grid">
        <thead><tr>
          <th style="width:34px"><input type="checkbox" data-g="all" title="Chọn tất cả"></th>
          <th style="width:64px">Mục</th><th style="width:150px">Địa điểm</th>
          <th style="width:52px;text-align:center">Bước</th><th>Nội dung</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="text-muted" style="font-size:12.5px;margin:8px 0 0;line-height:1.6">
      Ghi <b>Mục</b> (I, II…) và <b>Địa điểm</b> ở bước mở đầu; các bước sau để trống là thuộc cùng mục, cùng địa điểm.
      Số bước tự đánh liên tục. Excel cần các cột Mục, Địa điểm, Bước, Nội dung.</p>`;

  const tbody = qs('tbody', container);

  function render(checked = new Set()) {
    tbody.innerHTML = steps.length ? steps.map((s, i) => `
      <tr data-i="${i}">
        <td><input type="checkbox" data-sel ${checked.has(i) ? 'checked' : ''}></td>
        <td><input class="input" data-f="section" value="${esc(s.section)}" style="padding:5px 7px"></td>
        <td><input class="input" data-f="location" value="${esc(s.location)}" list="grid-locations" style="padding:5px 7px"></td>
        <td style="text-align:center;font-weight:700;color:var(--muted)">${i + 1}</td>
        <td><textarea class="textarea" data-f="content" rows="1" style="min-height:34px;padding:6px 8px;resize:vertical">${esc(s.content)}</textarea></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:18px">Chưa có bước nào. Bấm "Thêm" hoặc "Import Excel".</td></tr>';
    qsa('textarea', tbody).forEach(autoGrow);
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.max(34, el.scrollHeight + 2)}px`;
  }

  function changed() {
    dirty = true;
    onChange();
  }

  function selected() {
    return qsa('[data-sel]', tbody).map((el, i) => (el.checked ? i : -1)).filter((i) => i >= 0);
  }

  tbody.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    steps[Number(e.target.closest('tr').dataset.i)][f] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    changed();
  });

  function move(kind) {
    const sel = selected();
    if (!sel.length) { toast('Tích chọn các dòng cần di chuyển trước', 'info'); return; }
    const picked = sel.map((i) => steps[i]);
    const rest = steps.filter((_, i) => !sel.includes(i));
    let at;
    if (kind === 'top') at = 0;
    else if (kind === 'bottom') at = rest.length;
    else if (kind === 'up') at = Math.max(0, sel[0] - 1);
    else at = Math.min(rest.length, sel[0] + 1);
    steps = [...rest.slice(0, at), ...picked, ...rest.slice(at)];
    render(new Set(picked.map((_, k) => at + k)));
    changed();
  }

  container.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (!g || g === 'excel' || g === 'all') return;
    if (g === 'add') {
      // Thêm dưới dòng đang chọn cuối cùng, không chọn gì thì thêm cuối bảng.
      const sel = selected();
      const at = sel.length ? sel[sel.length - 1] + 1 : steps.length;
      steps.splice(at, 0, { section: '', location: '', content: '' });
      render();
      changed();
      qsa('tr', tbody)[at]?.querySelector('textarea')?.focus();
    } else if (g === 'del') {
      const sel = selected();
      if (!sel.length) { toast('Tích chọn các dòng cần xoá trước', 'info'); return; }
      const ok = await confirmDialog(`Xoá ${sel.length} bước đã chọn?`, { title: 'Xoá bước' });
      if (!ok) return;
      steps = steps.filter((_, i) => !sel.includes(i));
      render();
      changed();
    } else {
      move(g);
    }
  });

  qs('[data-g="all"]', container).addEventListener('change', (e) => {
    qsa('[data-sel]', tbody).forEach((el) => { el.checked = e.target.checked; });
  });

  qs('[data-g="excel"]', container).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const data = await api.upload('/api/ptt/nhap-excel', form);
      let replace = true;
      if (steps.some((s) => s.content.trim())) {
        replace = await confirmDialog(
          `File có ${data.total} bước. Thay toàn bộ ${steps.length} bước đang có? (Chọn "Huỷ" để thêm vào cuối bảng)`,
          { title: 'Import Excel', danger: false },
        );
      }
      steps = replace ? data.steps : [...steps, ...data.steps];
      render();
      changed();
      toast(`Đã đọc ${data.total} bước từ Excel. Bấm "Ghi" để lưu.`, 'success');
    } catch (err) { toast(err.message, 'error', 8000); }
  });

  render();
  return {
    getSteps: () => steps.map((s) => ({ ...s })),
    setSteps(next) { steps = next.map((s) => ({ ...s })); dirty = false; render(); },
    isDirty: () => dirty,
    markSaved() { dirty = false; },
  };
}
