import { api } from '../api.js';
import { icon } from '../icons.js';
import { isStale, setPage } from '../shell.js';
import { errorState, esc, loading, qs, toast } from '../ui.js';

export const meta = {
  title: 'Cấu hình hệ thống',
  subtitle: 'Trạng thái truy hồi, mô hình sinh câu trả lời và các tham số RAG đang áp dụng',
};

export async function render(root) {
  if (isStale(root)) return;
  setPage({
    ...meta,
    actions: `<button class="btn btn-sm" id="reindex-btn">${icon('refresh', 15)}Dựng lại chỉ mục</button>`,
  });
  root.innerHTML = loading();

  let config;
  let stats;
  try {
    [config, stats] = await Promise.all([api.config(), api.stats()]);
  } catch (err) {
    root.innerHTML = errorState(err.message);
    return;
  }

  root.innerHTML = `
    <div class="grid two-col">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--teal-soft);color:var(--teal)">${icon('assistant', 18)}</span>
            <h2 class="card-title">Sinh câu trả lời</h2>
            <div class="card-actions">
              ${config.generation.enabled
                ? '<span class="badge badge-green">Đang bật</span>'
                : '<span class="badge badge-grey">Chưa cấu hình</span>'}
            </div>
          </div>
          ${config.generation.enabled ? `
            <dl class="kv" style="grid-template-columns:150px 1fr">
              <dt>Mô hình</dt><dd class="mono">${esc(config.generation.model)}</dd>
            </dl>
            <div class="callout callout-info" style="margin-top:14px">
              Trợ lý tổng hợp câu trả lời từ các đoạn tài liệu truy hồi được và luôn kèm trích dẫn nguồn.
              Mô hình được ràng buộc chỉ trả lời dựa trên tài liệu, không tự suy diễn thông số kỹ thuật.
            </div>`
          : `
            <p style="margin:0 0 12px;line-height:1.7">
              Chưa đặt <code>ANTHROPIC_API_KEY</code>. Hệ thống vẫn tra cứu bình thường nhưng chỉ trả về
              các đoạn tài liệu liên quan nhất (chế độ trích lược) thay vì câu trả lời tổng hợp.
            </p>
            <div class="callout">
              Để bật: tạo file <code>.env</code> ở thư mục gốc dự án, thêm dòng
              <code>ANTHROPIC_API_KEY=...</code> rồi khởi động lại máy chủ.
            </div>`}
        </section>

        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--violet-soft);color:var(--violet)">${icon('layers', 18)}</span>
            <h2 class="card-title">Truy hồi tài liệu</h2>
          </div>
          <dl class="kv" style="grid-template-columns:180px 1fr">
            <dt>Phương pháp</dt>
            <dd>${config.embeddings.enabled
              ? 'Lai: BM25 từ khoá + vector ngữ nghĩa (hợp nhất RRF)'
              : 'BM25 từ khoá (unigram + bigram tiếng Việt)'}</dd>
            <dt>Embedding</dt>
            <dd>${config.embeddings.enabled
              ? `<span class="badge badge-green">${esc(config.embeddings.model)}</span>
                 <div class="text-muted" style="margin-top:5px">${config.embeddings.indexed_vectors} vector đã lưu</div>`
              : '<span class="badge badge-grey">Tắt — chạy hoàn toàn offline</span>'}</dd>
            <dt>Kích thước đoạn</dt><dd>${config.retrieval.chunk_size} ký tự</dd>
            <dt>Độ chồng lấn</dt><dd>${config.retrieval.chunk_overlap} ký tự</dd>
            <dt>Số đoạn lấy ra</dt><dd>${config.retrieval.top_k} đoạn / câu hỏi</dd>
            <dt>Tổng đoạn chỉ mục</dt>
            <dd><b>${Number(config.retrieval.indexed_chunks).toLocaleString('vi-VN')}</b></dd>
          </dl>
          <div class="callout callout-info" style="margin-top:14px">
            Không bật embedding thì hệ thống vẫn dùng được đầy đủ: BM25 có bigram xử lý khá tốt từ ghép
            tiếng Việt như "kích từ", "gối trục", "máy cắt". Bật thêm embedding sẽ giúp tìm được cả những
            đoạn diễn đạt khác từ nhưng cùng ý.
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <span class="thumb" style="background:var(--blue-soft);color:var(--blue)">${icon('upload', 18)}</span>
            <h2 class="card-title">Nạp tài liệu</h2>
          </div>
          <dl class="kv" style="grid-template-columns:180px 1fr">
            <dt>Định dạng hỗ trợ</dt><dd class="mono">${esc(config.upload.allowed.join('  '))}</dd>
            <dt>Dung lượng tối đa</dt><dd>${config.upload.max_mb} MB / tệp</dd>
          </dl>
          ${stats.failed_documents.length ? `
            <div class="callout callout-danger" style="margin-top:14px">
              <b>${stats.failed_documents.length} tài liệu chưa nạp được nội dung:</b>
              <ul class="bullet-list" style="color:inherit;margin-top:7px">
                ${stats.failed_documents.map((d) => `
                  <li><a href="#/thu-vien/${d.id}">${esc(d.title)}</a> — ${esc(d.index_error)}</li>`).join('')}
              </ul>
            </div>` : ''}
        </section>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Kho tri thức</h2></div>
          <dl class="kv" style="grid-template-columns:1fr auto">
            <dt>Tài liệu tải lên</dt><dd><b>${stats.counters.documents}</b></dd>
            <dt>Thiết bị</dt><dd><b>${stats.counters.equipment}</b></dd>
            <dt>Quy trình</dt><dd><b>${stats.counters.procedures}</b></dd>
            <dt>Hồ sơ sự cố</dt><dd><b>${stats.counters.incidents}</b></dd>
            <dt>Biểu mẫu</dt><dd><b>${stats.counters.forms}</b></dd>
            <dt>Đoạn chỉ mục</dt><dd><b>${stats.counters.chunks}</b></dd>
            <dt>Lượt tra cứu</dt><dd><b>${stats.counters.queries}</b></dd>
          </dl>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Phân bố theo phân loại</h2></div>
          ${Object.keys(stats.by_category).length ? `
            <div style="display:flex;flex-direction:column;gap:10px">
              ${categoryBars(stats.by_category)}
            </div>`
            : '<p class="text-muted" style="margin:0">Chưa có dữ liệu.</p>'}
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Bảo trì</h2></div>
          <p style="margin:0 0 12px;line-height:1.7;font-size:13px">
            Dựng lại chỉ mục khi nghi ngờ kết quả tra cứu không khớp với nội dung thư viện hiện tại.
            Thao tác này không xoá dữ liệu.
          </p>
          <button class="btn btn-primary" style="width:100%" id="reindex-btn-2">
            ${icon('refresh', 16)}Dựng lại chỉ mục tra cứu
          </button>
        </section>
      </div>
    </div>`;

  const reindex = async (btn) => {
    btn.disabled = true;
    try {
      const result = await api.reindexAll();
      toast(`Đã dựng lại chỉ mục: ${result.indexed_chunks} đoạn`, 'success');
      render(root);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
  document.querySelector('#reindex-btn').addEventListener('click', (e) => reindex(e.currentTarget));
  qs('#reindex-btn-2', root).addEventListener('click', (e) => reindex(e.currentTarget));
}

const CATEGORY_LABELS = {
  tai_lieu_ky_thuat: 'Tài liệu kỹ thuật thiết bị',
  quy_trinh_van_hanh: 'Quy trình vận hành',
  quy_trinh_bao_duong: 'Quy trình bảo dưỡng, sửa chữa',
  quy_trinh_su_co: 'Quy trình xử lý sự cố',
  so_do_ban_ve: 'Sơ đồ, bản vẽ',
  bai_hoc_kinh_nghiem: 'Bài học kinh nghiệm',
  bieu_mau: 'Biểu mẫu, phiếu',
  khac: 'Khác',
};

function categoryBars(byCategory) {
  const entries = Object.entries(byCategory);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  return entries.map(([key, n]) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
        <span>${esc(CATEGORY_LABELS[key] || key)}</span>
        <b>${n}</b>
      </div>
      <div style="height:7px;border-radius:4px;background:var(--bg);overflow:hidden">
        <div style="height:100%;width:${(n / max) * 100}%;background:var(--teal);border-radius:4px"></div>
      </div>
    </div>`).join('');
}
