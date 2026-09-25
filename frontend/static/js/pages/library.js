import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { isStale, setPage } from '../shell.js';
import {
  confirmDialog, emptyState, errorState, esc, formatBytes, formatDateTime,
  loading, openModal, qs, toast,
} from '../ui.js';

// Thư viện kỹ thuật chia ba trang theo nhóm tài liệu. Cùng một kho, cùng một
// cách tra cứu; mỗi trang chỉ lọc sẵn các phân loại của nhóm mình.
const PROCEDURE_VH = ['quy_trinh_van_hanh', 'quy_trinh_su_co'];
const PROCEDURE_BD = ['quy_trinh_bao_duong'];

export const LIBRARY_GROUPS = {
  vh: {
    path: '/quy-trinh-vh',
    title: 'Quy trình vận hành và xử lý sự cố',
    subtitle: 'Quy trình VH&XLSC các hệ thống, thiết bị của nhà máy — mở đọc trực tiếp, tìm thông số và cách xử lý',
    cats: PROCEDURE_VH,
    upload: 'quy_trinh_van_hanh',
    placeholder: 'VD: quy trình máy biến áp, hệ thống kích từ…',
  },
  bd: {
    path: '/quy-trinh-bd',
    title: 'Quy trình bảo dưỡng, sửa chữa',
    subtitle: 'Quy trình, hướng dẫn bảo dưỡng định kỳ và sửa chữa thiết bị',
    cats: PROCEDURE_BD,
    upload: 'quy_trinh_bao_duong',
    placeholder: 'VD: bảo dưỡng máy cắt, sửa chữa cửa van…',
  },
  tl: {
    path: '/thu-vien',
    title: 'Tài liệu kỹ thuật',
    subtitle: 'Tài liệu thiết bị của nhà chế tạo, sơ đồ, bản vẽ, bài học kinh nghiệm',
    cats: null, // mọi phân loại còn lại
    upload: 'tai_lieu_ky_thuat',
    placeholder: 'Tìm theo tên tài liệu, thẻ, thiết bị…',
  },
};

function groupCats(group, all) {
  if (group.cats) return all.filter((c) => group.cats.includes(c.value));
  const taken = [...PROCEDURE_VH, ...PROCEDURE_BD];
  return all.filter((c) => !taken.includes(c.value));
}

export function groupOf(category) {
  return Object.values(LIBRARY_GROUPS).find((g) => g.cats?.includes(category)) || LIBRARY_GROUPS.tl;
}

export function createLibraryPage(key) {
  const group = LIBRARY_GROUPS[key];
  return {
    meta: { title: group.title, subtitle: group.subtitle },
    render: (root, ctx) => render(root, ctx, group),
  };
}

// Nhãn nói theo việc vận hành viên quan tâm — tài liệu có tra cứu được hay
// không — chứ không nói theo cơ chế bên trong.
const STATUS = {
  da_lap_chi_muc: ['badge-green', 'Sẵn sàng tra cứu'],
  dang_xu_ly: ['badge-amber', 'Đang xử lý'],
  cho_xu_ly: ['badge-grey', 'Chờ xử lý'],
  loi: ['badge-red', 'Lỗi nạp'],
};

async function render(root, ctx, group) {
  if (ctx.params.id) return renderDetail(root, Number(ctx.params.id));

  setPage({
    title: group.title,
    subtitle: group.subtitle,
    actions: `<button class="btn btn-accent" id="upload-btn">${icon('upload', 16)}TẢI TÀI LIỆU</button>`,
  });
  root.innerHTML = loading();

  let categories;
  let equipment;
  try {
    [categories, equipment] = await Promise.all([api.categories(), api.equipmentList()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  categories = { items: groupCats(group, categories.items) };

  root.innerHTML = `
    <div class="toolbar">
      <div class="search">
        ${icon('search', 17)}
        <input class="input" id="filter-q" placeholder="${esc(group.placeholder)}"
               value="${esc(ctx.query.q || '')}">
      </div>
      <select class="select" id="filter-category" ${categories.items.length < 2 ? 'hidden' : ''}>
        <option value="">Mọi phân loại</option>
        ${categories.items.map((c) => `<option value="${c.value}">${esc(c.label)}</option>`).join('')}
      </select>
      <select class="select" id="filter-equipment">
        <option value="">Mọi thiết bị</option>
        ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
      </select>

    </div>
    <div id="doc-list"></div>`;

  const list = qs('#doc-list', root);
  const filters = ['#filter-q', '#filter-category', '#filter-equipment']
    .map((sel) => qs(sel, root));

  let timer;
  filters.forEach((el) => {
    const event = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(event, () => {
      clearTimeout(timer);
      timer = setTimeout(load, event === 'input' ? 260 : 0);
    });
  });

  qs('#upload-btn').addEventListener('click', () => openUpload(categories, equipment, load, group.upload));

  list.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const ok = await confirmDialog(
        'Xoá tài liệu này khỏi thư viện? Tệp gốc và khả năng tra cứu trong tài liệu sẽ mất.',
        { title: 'Xoá tài liệu' },
      );
      if (!ok) return;
      try {
        await api.del(`/api/documents/${del.dataset.delete}`);
        toast('Đã xoá tài liệu', 'success');
        load();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  async function load() {
    list.innerHTML = loading();
    try {
      const data = await api.documents({
        q: filters[0].value.trim(),
        category: filters[1].value,
        categories: categories.items.map((c) => c.value).join(','),
        equipment_id: filters[2].value,
        source_kind: 'tep',
      });
      list.innerHTML = data.items.length
        ? `<div class="list">${data.items.map((it) => docRow(it, group.path)).join('')}</div>
           <div class="text-muted" style="margin-top:14px">${data.total} tài liệu</div>`
        : emptyState({
            iconName: 'library',
            title: 'Chưa có tài liệu phù hợp',
            text: 'Tải lên tài liệu kỹ thuật, quy trình hoặc bài học kinh nghiệm để trợ lý có căn cứ trả lời.',
          });
    } catch (err) {
      list.innerHTML = errorState(err.message);
    }
  }

  load();
}

function docRow(item, base) {
  const [cls, label] = STATUS[item.index_status] || STATUS.cho_xu_ly;
  const isFile = item.source_kind === 'tep';
  return `
    <a class="row-card" href="#${base}/${item.id}">
      <span class="thumb" style="background:${isFile ? 'var(--blue-soft)' : 'var(--teal-soft)'};
            color:${isFile ? 'var(--blue)' : 'var(--teal)'}">
        ${icon(isFile ? 'file' : 'layers', 18)}
      </span>
      <div class="row-body">
        <div class="row-title">${esc(item.title)}</div>
        <div class="row-meta">
          <span class="badge badge-grey">${esc(item.category_label)}</span>
          ${item.equipment_name ? `<span>${icon('equipment', 13)} ${esc(item.equipment_name)}</span>` : ''}
          ${isFile && item.size_bytes ? `<span>${esc(formatBytes(item.size_bytes))}</span>` : ''}
          <span>${esc(formatDateTime(item.created_at))}</span>
        </div>
        ${item.index_error ? `<div class="row-desc" style="color:var(--red)">${esc(item.index_error)}</div>` : ''}
      </div>
      <div class="row-side">
        <span class="badge ${cls}">${esc(label)}</span>
        ${isFile ? `<button class="btn btn-icon btn-danger" data-delete="${item.id}"
                      title="Xoá tài liệu">${icon('trash', 15)}</button>` : ''}
      </div>
    </a>`;
}

function openUpload(categories, equipment, onDone, preset) {
  openModal({
    title: 'Tải tài liệu vào thư viện kỹ thuật',
    body: `
      <form id="upload-form">
        <div class="field">
          <label>Tệp tài liệu <span class="hint">(PDF, DOCX, XLSX, CSV, TXT, MD)</span></label>
          <input class="input" type="file" name="file" required
                 accept=".pdf,.docx,.txt,.md,.xlsx,.csv">
        </div>
        <div class="field">
          <label>Tên tài liệu <span class="hint">(để trống sẽ lấy theo tên tệp)</span></label>
          <input class="input" name="title" placeholder="VD: Hướng dẫn vận hành hệ thống kích từ">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Phân loại</label>
            <select class="select" name="category">
              ${categories.items.map((c) => `<option value="${c.value}" ${c.value === preset ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Thiết bị liên quan</label>
            <select class="select" name="equipment_id">
              <option value="">— Không gắn thiết bị —</option>
              ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Phiên bản</label>
            <input class="input" name="version" placeholder="VD: Rev.03">
          </div>
          <div class="field">
            <label>Ngày ban hành</label>
            <input class="input" type="date" name="issued_date">
          </div>
        </div>
        <div class="field">
          <label>Thẻ <span class="hint">(cách nhau bằng dấu phẩy)</span></label>
          <input class="input" name="tags" placeholder="tuabin, điều tốc, dầu áp lực">
        </div>
        <div class="field">
          <label>Mô tả ngắn</label>
          <textarea class="textarea" name="description" style="min-height:60px"></textarea>
        </div>
        <div class="callout callout-info">
          Hệ thống tự đọc nội dung để tra cứu được ngay; tệp gốc vẫn giữ nguyên để mở ra đọc. PDF bản scan cần OCR trước khi tải lên.
        </div>
      </form>`,
    footer: `
      <button class="btn" data-close>Huỷ</button>
      <button class="btn btn-primary" id="do-upload">${icon('upload', 16)}Tải lên tài liệu</button>`,
    onMount(root, close) {
      const btn = qs('#do-upload', root);
      btn.addEventListener('click', async () => {
        const form = qs('#upload-form', root);
        if (!form.reportValidity()) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Đang nạp tài liệu…';
        try {
          const result = await api.upload('/api/documents', new FormData(form));
          close();
          if (result.index_status === 'loi') {
            toast(`Đã lưu tệp nhưng không nạp được nội dung: ${result.index_error}`, 'error', 8000);
          } else {
            toast(`Đã nạp "${result.title}", tra cứu được ngay`, 'success');
          }
          onDone();
        } catch (err) {
          toast(err.message, 'error', 7000);
          btn.disabled = false;
          btn.innerHTML = 'Tải lên tài liệu';
        }
      });
    },
  });
}

function passage(item) {
  const where = [item.heading, item.page ? `trang ${item.page}` : ''].filter(Boolean).join(' · ');
  return `
    <div class="callout" style="margin-bottom:10px">
      ${where ? `<div class="text-muted" style="font-size:12px;margin-bottom:5px">${esc(where)}</div>` : ''}
      <div style="line-height:1.7">${esc(item.excerpt)}</div>
    </div>`;
}

async function renderDetail(root, id) {
  root.innerHTML = loading();
  let doc;
  try {
    doc = await api.document(id);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }
  if (isStale(root)) return;

  const isFile = doc.source_kind === 'tep';
  setPage({
    title: doc.title,
    subtitle: `${doc.category_label}${doc.equipment_name ? ' · ' + doc.equipment_name : ''}`,
    actions: `
      <button class="btn btn-sm" data-back>${icon('chevronLeft', 15)}${esc(groupOf(doc.category).title)}</button>
      ${isFile && doc.stored_name ? `
        <a class="btn btn-accent btn-sm" href="/api/documents/${id}/xem" target="_blank" rel="noopener">
          ${icon('library', 15)}MỞ TÀI LIỆU</a>
        <a class="btn btn-sm" href="/api/documents/${id}/file?tai_ve=true">
          ${icon('download', 15)}Tải về</a>` : ''}
      ${isFile ? `<button class="btn btn-sm" id="reindex">${icon('refresh', 15)}Nạp lại</button>` : ''}`,
  });

  const [cls, label] = STATUS[doc.index_status] || STATUS.cho_xu_ly;
  root.innerHTML = `
    <div class="grid two-col">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Tìm trong tài liệu này</h2>
        </div>
        ${doc.n_chars ? `
          <div class="search" style="margin-bottom:14px">
            ${icon('search', 17)}
            <input class="input" id="doc-q" autocomplete="off"
                   placeholder="VD: áp lực dầu định mức, đèn LOW PRESSURE sáng, trình tự mở cửa van…">
          </div>
          <div id="doc-results">
            <p class="text-muted" style="margin:0">
              Nhập từ khoá để tìm thông số kỹ thuật hoặc cách xử lý sự cố ngay trong tài liệu này.
              Muốn đọc toàn văn thì bấm <b>Mở tài liệu</b> ở trên — tài liệu mở thẳng
              trong trình duyệt, không phải tải về.
            </p>
          </div>`
        : `<div class="callout callout-danger">Chưa trích xuất được nội dung nên không tìm kiếm được.
            ${doc.index_error ? esc(doc.index_error) : ''}</div>`}
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">Thông tin tài liệu</h2></div>
        <dl class="kv" style="grid-template-columns:130px 1fr">
          <dt>Trạng thái</dt><dd><span class="badge ${cls}">${esc(label)}</span></dd>
          <dt>Phân loại</dt><dd>${isFile ? `<select class="select" id="doc-category" style="padding:4px 8px;font-size:13px"></select>` : esc(doc.category_label)}</dd>
          <dt>Nguồn</dt><dd>${isFile ? 'Tệp tải lên' : 'Sinh từ bản ghi nghiệp vụ'}</dd>
          ${doc.equipment_name ? `<dt>Thiết bị</dt><dd>${esc(doc.equipment_name)}</dd>` : ''}
          ${doc.filename ? `<dt>Tên tệp</dt><dd class="mono">${esc(doc.filename)}</dd>` : ''}
          ${doc.size_bytes ? `<dt>Dung lượng</dt><dd>${esc(formatBytes(doc.size_bytes))}</dd>` : ''}
          ${doc.version ? `<dt>Phiên bản</dt><dd>${esc(doc.version)}</dd>` : ''}
          ${doc.issued_date ? `<dt>Ngày ban hành</dt><dd>${esc(doc.issued_date)}</dd>` : ''}
          ${doc.tags ? `<dt>Thẻ</dt><dd>${esc(doc.tags)}</dd>` : ''}
          <dt>Số ký tự</dt><dd>${Number(doc.n_chars).toLocaleString('vi-VN')}</dd>
          <dt>Ngày nạp</dt><dd>${esc(formatDateTime(doc.created_at))}</dd>
        </dl>
        ${doc.description ? `
          <div class="section-title">Mô tả</div>
          <p style="margin:0;line-height:1.7">${esc(doc.description)}</p>` : ''}
        <div class="section-title">Tra cứu</div>
        <button class="btn btn-primary" style="width:100%" id="ask-about">
          ${icon('assistant', 16)}Hỏi trợ lý về tài liệu này
        </button>
      </section>
    </div>`;

  document.querySelector('[data-back]')?.addEventListener('click', () => navigate(groupOf(doc.category).path));

  // Đổi phân loại là chuyển tài liệu sang trang thư viện khác (VH&XLSC, BD-SC,
  // tài liệu kỹ thuật) — cần khi lỡ tải lên nhầm nhóm.
  const catSelect = qs('#doc-category', root);
  if (catSelect) {
    api.categories().then((cats) => {
      catSelect.innerHTML = cats.items.map((c) => `<option value="${c.value}" ${c.value === doc.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
    });
    catSelect.addEventListener('change', async () => {
      try {
        const saved = await api.put(`/api/documents/${id}`, { category: catSelect.value });
        const target = groupOf(saved.category);
        toast(`Đã chuyển sang "${target.title}"`, 'success');
        navigate(`${target.path}/${id}`);
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  qs('#ask-about', root).addEventListener('click', () => navigate('/tro-ly', { q: doc.title }));

  const inputQ = document.querySelector('#doc-q');
  if (inputQ) {
    const results = qs('#doc-results', root);
    let timer;
    const run = async () => {
      const q = inputQ.value.trim();
      if (!q) {
        results.innerHTML = '<p class="text-muted" style="margin:0">Nhập từ khoá để tìm trong tài liệu này.</p>';
        return;
      }
      results.innerHTML = loading();
      try {
        const data = await api.get(`/api/documents/${id}/search`, { q });
        if (isStale(root)) return;
        results.innerHTML = data.items.length
          ? `<div class="text-muted" style="margin-bottom:10px">${data.total} đoạn khớp</div>`
            + data.items.map(passage).join('')
          : '<p class="text-muted" style="margin:0">Không tìm thấy đoạn nào khớp trong tài liệu này.</p>';
      } catch (err) {
        results.innerHTML = errorState(err.message);
      }
    };
    inputQ.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 260); });
    inputQ.focus();
  }
  document.querySelector('#reindex')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await api.post(`/api/documents/${id}/reindex`);
      toast('Đã nạp lại tài liệu', 'success');
      renderDetail(root, id);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  });
}
