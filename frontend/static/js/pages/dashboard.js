import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { setPage } from '../shell.js';
import { errorState, esc, formatDateTime, loading, qs } from '../ui.js';
import { groupOf } from './library.js';

const SEVERITY_BADGE = {
  nghiem_trong: ['badge-red', 'Nghiêm trọng'],
  trung_binh: ['badge-amber', 'Trung bình'],
  nhe: ['badge-grey', 'Nhẹ / bất thường'],
};

const SUGGESTIONS = [
  'Trình tự khởi động tổ máy H1 từ trạng thái dừng dự phòng',
  'Xử lý khi nhiệt độ gối trục hướng máy phát tăng cao',
  'Máy cắt đầu cực nhảy do bảo vệ so lệch, xử lý thế nào?',
  'Quy trình bảo dưỡng định kỳ hệ thống kích từ',
  'Cô lập hệ thống nước làm mát tổ máy để sửa chữa',
];

export const meta = {
  title: 'Nhà máy Thủy điện Hủa Na',
  subtitle: 'Hệ thống tra cứu tài liệu kỹ thuật, quy trình vận hành và xử lý sự cố',
};

export async function render(root) {
  setPage({
    ...meta,
    actions: `<button class="btn btn-accent" data-goto="/tro-ly">${icon('assistant', 16)}HỎI TRỢ LÝ</button>`,
  });
  root.innerHTML = loading();

  let stats;
  let config;
  try {
    [stats, config] = await Promise.all([api.stats(), api.config()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }

  const c = stats.counters;
  const lib = stats.library_by_category || {};
  const sum = (cats) => cats.reduce((n, cat) => n + (lib[cat] || 0), 0);
  const nVH = sum(['quy_trinh_van_hanh', 'quy_trinh_su_co']);
  const nBD = sum(['quy_trinh_bao_duong']);
  const nDocs = c.documents - nVH - nBD;
  const tk = stats.tickets_today;
  root.innerHTML = `
    <div class="section-title">Thư viện kỹ thuật</div>
    <div class="grid stat-grid" style="margin-bottom:14px">
      ${statCard('file', 'blue', 'Quy trình VH & XLSC', nVH, 'quy trình', '/quy-trinh-vh')}
      ${statCard('layers', 'teal', 'Quy trình BD, SC', nBD, 'quy trình', '/quy-trinh-bd')}
      ${statCard('library', 'blue', 'Tài liệu kỹ thuật', nDocs, 'tài liệu', '/thu-vien')}
      ${statCard('equipment', 'teal', 'Danh mục thiết bị', c.equipment, 'thiết bị', '/thiet-bi')}
    </div>
    <div class="section-title">Nghiệp vụ</div>
    <div class="grid stat-grid" style="margin-bottom:16px">
      ${statCard('forms', tk.ton ? 'red' : 'violet', 'Phiếu thao tác hôm nay', tk.tong,
                 tk.ton ? `phiếu · ${tk.ton} tồn chưa xác nhận` : `phiếu · ${tk.mo} chưa xác nhận`, '/phieu-thao-tac')}
      ${statCard('operations', 'green', 'Thao tác vận hành', c.journal_thao_tac, 'bản ghi', '/thao-tac')}
      ${statCard('incident', 'red', 'Xử lý bất thường, sự cố', c.incidents, 'hồ sơ', '/su-co')}
      ${statCard('maintenance', 'amber', 'Bảo dưỡng, sửa chữa', c.journal_bao_duong, 'bản ghi', '/sua-chua')}
    </div>

    <div class="grid two-col">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Tra cứu nhanh thư viện kỹ thuật</h2>
          </div>
          <form id="quick-search" class="toolbar" style="margin-bottom:14px">
            <div class="search" style="flex:1 1 100%;max-width:none">
              ${icon('search', 17)}
              <input class="input" name="q" autocomplete="off"
                     placeholder="Nhập hiện tượng, tên thiết bị hoặc câu hỏi kỹ thuật…">
            </div>
            <button class="btn btn-primary" type="submit">${icon('assistant', 16)}Hỏi trợ lý</button>
          </form>
          <div class="section-title">Câu hỏi gợi ý</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${SUGGESTIONS.map((s) => `<button class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Nhật ký thao tác, bảo dưỡng gần đây</h2>
            <div class="card-actions">
              <button class="btn btn-sm" data-goto="/thao-tac">Thao tác</button>
              <button class="btn btn-sm" data-goto="/sua-chua">Bảo dưỡng</button>
            </div>
          </div>
          ${listOrEmpty(stats.recent_journal || [], journalRow, 'Chưa có bản ghi nào. Vận hành viên ghi lại sau mỗi lần thao tác, bảo dưỡng.')}
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Bất thường, sự cố cập nhật gần đây</h2>
            <div class="card-actions">
              <button class="btn btn-sm" data-goto="/su-co">Xem tất cả</button>
            </div>
          </div>
          ${listOrEmpty(stats.recent_incidents, incidentRow, 'Chưa có hồ sơ sự cố nào.')}
        </section>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Trạng thái hệ thống</h2></div>
          ${systemStatus(config)}
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Tài liệu mới nạp</h2>
            <div class="card-actions">
              <button class="btn btn-sm" data-goto="/quy-trinh-vh">Thư viện</button>
            </div>
          </div>
          ${listOrEmpty(stats.recent_documents, documentRow, 'Chưa có tài liệu nào được nạp.')}
        </section>

        ${stats.recent_queries.length ? `
        <section class="card">
          <div class="card-head"><h2 class="card-title">Lượt tra cứu gần đây</h2></div>
          <div class="list">
            ${stats.recent_queries.map((q) => `
              <button class="row-card" data-ask="${esc(q.question)}" style="padding:11px 13px">
                <div class="row-body">
                  <div style="font-size:13.5px;color:var(--ink)">${esc(q.question)}</div>
                  <div class="row-meta">${icon('clock', 13)}${esc(formatDateTime(q.created_at))}</div>
                </div>
              </button>`).join('')}
          </div>
        </section>` : ''}
      </div>
    </div>`;

  if (stats.failed_documents.length) {
    const warn = document.createElement('div');
    warn.className = 'callout callout-danger';
    warn.style.marginTop = '16px';
    warn.innerHTML = `<strong>${stats.failed_documents.length} tài liệu chưa nạp được nội dung.</strong>
      Thường gặp với PDF bản scan — cần OCR trước khi tải lên.
      <a href="#/thu-vien">Xem trong thư viện</a>`;
    root.appendChild(warn);
  }

  qs('#quick-search', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const value = new FormData(e.target).get('q').trim();
    if (value) navigate('/tro-ly', { q: value });
  });

  root.addEventListener('click', (e) => {
    const ask = e.target.closest('[data-ask]');
    if (ask) { navigate('/tro-ly', { q: ask.dataset.ask }); return; }
    const goto = e.target.closest('[data-goto]');
    if (goto) navigate(goto.dataset.goto);
  });
}

function journalRow(j) {
  const base = j.kind === 'thao_tac' ? '/thao-tac' : '/sua-chua';
  const [day, time] = (j.started_at || '').split('T');
  const when = day ? `${(time || '').slice(0, 5)} ${day.split('-').reverse().join('/')}` : '';
  return `
    <button class="row-card" data-goto="${base}/${j.id}" style="padding:11px 13px;text-align:left;width:100%">
      <div class="row-body">
        <div class="row-title" style="font-size:13.5px">${esc(j.title)}</div>
        <div class="row-meta">
          <span class="badge ${j.kind === 'thao_tac' ? 'badge-green' : 'badge-amber'}">${j.kind === 'thao_tac' ? 'Thao tác' : 'Bảo dưỡng'}</span>
          ${when ? `<span>${icon('clock', 13)} ${esc(when)}</span>` : ''}
          ${j.equipment_name ? `<span>${esc(j.equipment_name)}</span>` : ''}
        </div>
      </div>
    </button>`;
}

function statCard(iconName, tone, label, value, unit, path) {
  const tones = {
    blue: ['var(--blue-soft)', 'var(--blue)'],
    teal: ['var(--teal-soft)', 'var(--teal)'],
    green: ['var(--green-soft)', 'var(--green)'],
    red: ['var(--red-soft)', 'var(--red)'],
    violet: ['var(--violet-soft)', 'var(--violet)'],
    amber: ['var(--amber-soft)', 'var(--amber)'],
  };
  const [bg, fg] = tones[tone] || tones.teal;
  return `
    <button class="stat" data-goto="${path}" style="text-align:left;border:none;cursor:pointer;font:inherit">
      <div class="stat-top">
        <span class="stat-icon" style="background:${bg};color:${fg}">${icon(iconName, 18)}</span>
        <span class="stat-label">${esc(label)}</span>
      </div>
      <div class="stat-value">${Number(value).toLocaleString('vi-VN')}<span>${esc(unit)}</span></div>
    </button>`;
}

function systemStatus(config) {
  const gen = config.generation;
  const emb = config.embeddings;
  return `
    <dl class="kv" style="grid-template-columns:150px 1fr">
      <dt>Sinh câu trả lời</dt>
      <dd>${gen.enabled
        ? `<span class="badge badge-green">${icon('check', 12)}Đang bật</span>
           <div class="text-muted" style="margin-top:5px;font-size:12.5px">${esc(gen.model)}</div>`
        : `<span class="badge badge-grey">Chưa cấu hình</span>
           <div class="text-muted" style="margin-top:5px;font-size:12.5px">Đặt ANTHROPIC_API_KEY để bật</div>`}
      </dd>
      <dt>Tìm kiếm ngữ nghĩa</dt>
      <dd>${emb.enabled
        ? `<span class="badge badge-green">${icon('check', 12)}Đang bật</span>
           <div class="text-muted" style="margin-top:5px;font-size:12.5px">${esc(emb.model)} · ${emb.indexed_vectors} vector</div>`
        : `<span class="badge badge-blue">BM25 từ khoá</span>
           <div class="text-muted" style="margin-top:5px;font-size:12.5px">Chạy offline, không cần dịch vụ ngoài</div>`}
      </dd>
      <dt>Kho chỉ mục</dt>
      <dd>${Number(config.retrieval.indexed_chunks).toLocaleString('vi-VN')} đoạn văn bản</dd>
      <dt>Định dạng nhận</dt>
      <dd class="text-muted">${esc(config.upload.allowed.join(', '))} — tối đa ${config.upload.max_mb} MB</dd>
    </dl>`;
}

function listOrEmpty(items, rowFn, emptyText) {
  if (!items.length) return `<p class="text-muted" style="margin:0">${esc(emptyText)}</p>`;
  return `<div class="list">${items.map(rowFn).join('')}</div>`;
}

function incidentRow(item) {
  const [cls, label] = SEVERITY_BADGE[item.severity] || SEVERITY_BADGE.trung_binh;
  return `
    <a class="row-card" href="#/su-co/${item.id}">
      <span class="thumb" style="background:var(--red-soft);color:var(--red)">${icon('incident', 18)}</span>
      <div class="row-body">
        <div class="row-title">${esc(item.title)}</div>
        <div class="row-meta">
          ${item.equipment_name ? `<span>${icon('equipment', 13)} ${esc(item.equipment_name)}</span>` : ''}
          <span>${icon('clock', 13)} ${esc(formatDateTime(item.updated_at))}</span>
        </div>
      </div>
      <div class="row-side"><span class="badge ${cls}">${esc(label)}</span></div>
    </a>`;
}

function documentRow(item) {
  const failed = item.index_status === 'loi';
  return `
    <a class="row-card" href="#${groupOf(item.category).path}/${item.id}" style="padding:12px 14px">
      <span class="thumb" style="background:var(--blue-soft);color:var(--blue);width:34px;height:34px">
        ${icon('file', 16)}
      </span>
      <div class="row-body">
        <div class="row-title" style="font-size:13.5px">${esc(item.title)}</div>
        <div class="row-meta">
          <span>${item.n_chunks} đoạn</span>
          <span>${esc(formatDateTime(item.created_at))}</span>
        </div>
      </div>
      ${failed ? '<span class="badge badge-red">Lỗi nạp</span>' : ''}
    </a>`;
}
