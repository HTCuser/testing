import { api } from '../api.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import { setPage } from '../shell.js';
import { esc, formatDateTime, markdown, qs, toast } from '../ui.js';

const SCOPES = [
  { value: '', label: 'Toàn bộ thư viện' },
  { value: 'quy_trinh', label: 'Chỉ quy trình' },
  { value: 'su_co', label: 'Chỉ hồ sơ sự cố' },
  { value: 'tep', label: 'Chỉ tài liệu tải lên' },
  { value: 'bieu_mau', label: 'Chỉ biểu mẫu' },
];

const SOURCE_LINK = {
  quy_trinh: (id) => `#/van-hanh/${id}`,
  su_co: (id) => `#/su-co/${id}`,
  bieu_mau: (id) => `#/bieu-mau/${id}`,
  nhat_ky_thao_tac: (id) => `#/thao-tac/${id}`,
  nhat_ky_bao_duong: (id) => `#/sua-chua/${id}`,
};

export const meta = {
  title: 'Trợ lý kỹ thuật',
  subtitle: 'Hỏi đáp dựa trên tài liệu, quy trình và hồ sơ sự cố của nhà máy',
};

let history = [];

export async function render(root, ctx) {
  setPage({
    ...meta,
    actions: `<button class="btn btn-sm" id="clear-chat">${icon('refresh', 15)}Hội thoại mới</button>`,
  });

  const equipment = await api.equipmentList().catch(() => ({ items: [] }));

  root.innerHTML = `
    <div class="assistant">
      <section class="card">
        <div id="chat-log" class="chat-log"></div>
        <form id="ask-form" class="ask-box" style="margin-top:20px;border-top:1px solid var(--line);padding-top:18px">
          <textarea class="textarea" name="question" required
            placeholder="Ví dụ: Khi nhiệt độ gối trục hướng máy phát vượt 70°C thì vận hành viên phải xử lý thế nào?"></textarea>
          <div class="ask-row">
            <select class="select" name="source_kind">
              ${SCOPES.map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('')}
            </select>
            <select class="select" name="equipment_id">
              <option value="">Mọi thiết bị</option>
              ${equipment.items.map((e) => `<option value="${e.id}">${esc(e.code)} — ${esc(e.name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary" type="submit" id="ask-btn">
              ${icon('assistant', 16)}Gửi câu hỏi
            </button>
          </div>
          <div class="text-muted" style="font-size:12px">
            Nhấn Ctrl + Enter để gửi. Câu trả lời chỉ dựa trên tài liệu đã nạp vào thư viện.
          </div>
        </form>
      </section>

      <aside class="card" id="source-panel" style="position:sticky;top:16px">
        <div class="card-head"><h2 class="card-title">Nguồn trích dẫn</h2></div>
        <p class="text-muted" style="margin:0;font-size:13px">
          Các đoạn tài liệu dùng để tạo câu trả lời sẽ hiện ở đây. Bấm vào nguồn để mở tài liệu gốc.
        </p>
      </aside>
    </div>`;

  const log = qs('#chat-log', root);
  const form = qs('#ask-form', root);
  const textarea = form.question;

  renderHistory(log);

  qs('#clear-chat').addEventListener('click', () => {
    history = [];
    renderHistory(log);
    qs('#source-panel', root).innerHTML = `
      <div class="card-head"><h2 class="card-title">Nguồn trích dẫn</h2></div>
      <p class="text-muted" style="margin:0;font-size:13px">Chưa có câu hỏi nào trong hội thoại này.</p>`;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(new FormData(form), root, log, textarea);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });

  root.addEventListener('click', (e) => {
    const cite = e.target.closest('.cite');
    if (cite) {
      const card = qs(`.source-card[data-n="${cite.dataset.cite}"]`, root);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = 'var(--accent)';
        setTimeout(() => { card.style.borderColor = ''; }, 1600);
      }
    }
    const source = e.target.closest('.source-card');
    if (source && source.dataset.href) navigate(source.dataset.href.replace('#', ''));
  });

  const preset = ctx.query.q;
  if (preset && !history.some((h) => h.question === preset)) {
    const data = new FormData();
    data.set('question', preset);
    submit(data, root, log, textarea);
  } else {
    textarea.focus();
  }
}

async function submit(formData, root, log, textarea) {
  const question = String(formData.get('question') || '').trim();
  if (!question) return;

  const entry = { question, pending: true };
  history.push(entry);
  renderHistory(log);
  textarea.value = '';
  qs('#ask-btn').disabled = true;

  try {
    const result = await api.ask({
      question,
      source_kind: formData.get('source_kind') || '',
      equipment_id: formData.get('equipment_id') ? Number(formData.get('equipment_id')) : null,
    });
    Object.assign(entry, { pending: false, ...result });
    renderHistory(log);
    renderSources(root, result);
  } catch (err) {
    entry.pending = false;
    entry.answer = `Không gửi được câu hỏi: ${err.message}`;
    entry.mode = 'loi';
    entry.sources = [];
    renderHistory(log);
    toast(err.message, 'error');
  } finally {
    const btn = qs('#ask-btn');
    if (btn) btn.disabled = false;
  }
}

function renderHistory(log) {
  if (!history.length) {
    log.innerHTML = `
      <div class="empty" style="padding:36px 20px">
        ${icon('assistant', 42)}
        <h3>Hỏi bất cứ điều gì về thiết bị và quy trình nhà máy</h3>
        <p>Trợ lý tra cứu trong tài liệu kỹ thuật, quy trình vận hành, hồ sơ sự cố và biểu mẫu đã nạp,
           sau đó trả lời kèm trích dẫn nguồn.</p>
      </div>`;
    return;
  }

  log.innerHTML = history.map((entry) => {
    if (entry.pending) {
      return `
        <div class="bubble-q">${esc(entry.question)}</div>
        <div class="bubble-a">
          <div class="answer" style="display:flex;gap:11px;align-items:center;color:var(--muted)">
            <span class="spinner"></span> Đang tra cứu thư viện kỹ thuật…
          </div>
        </div>`;
    }
    return `
      <div class="bubble-q">${esc(entry.question)}</div>
      <div class="bubble-a">
        <div class="answer">${markdown(entry.answer, { onCite: true })}</div>
        <div class="row-meta" style="margin-top:8px;font-size:12px">
          ${modeBadge(entry.mode)}
          ${entry.sources?.length ? `<span>${entry.sources.length} nguồn trích dẫn</span>` : ''}
          ${entry.latency_ms ? `<span>${entry.latency_ms} ms</span>` : ''}
        </div>
      </div>`;
  }).join('');
  log.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function modeBadge(mode) {
  const map = {
    claude: ['badge-green', 'Tổng hợp bằng mô hình'],
    trich_luoc: ['badge-blue', 'Chế độ trích lược tài liệu'],
    khong_co_ket_qua: ['badge-amber', 'Không tìm thấy tài liệu'],
    loi: ['badge-red', 'Lỗi'],
  };
  const [cls, label] = map[mode] || ['badge-grey', mode || ''];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function renderSources(root, result) {
  const panel = qs('#source-panel', root);
  if (!result.sources.length) {
    panel.innerHTML = `
      <div class="card-head"><h2 class="card-title">Nguồn trích dẫn</h2></div>
      <div class="callout">Không tìm thấy đoạn tài liệu nào khớp với câu hỏi.
        Hãy bổ sung tài liệu liên quan vào <a href="#/thu-vien">thư viện kỹ thuật</a>.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="card-head">
      <h2 class="card-title">Nguồn trích dẫn</h2>
      <div class="card-actions"><span class="badge badge-grey">${result.sources.length}</span></div>
    </div>
    <div class="list">
      ${result.sources.map((s) => {
        const href = s.source_id && SOURCE_LINK[s.source_kind]
          ? SOURCE_LINK[s.source_kind](s.source_id)
          : `#/thu-vien/${s.document_id}`;
        const where = [s.heading, s.page ? `trang ${s.page}` : ''].filter(Boolean).join(' · ');
        return `
          <div class="source-card" data-n="${s.n}" data-href="${href}">
            <div class="src-head">
              <span class="src-n">${s.n}</span>
              <span class="src-title">${esc(s.doc_title)}</span>
            </div>
            ${where ? `<div class="src-meta">${esc(where)}</div>` : ''}
            ${s.equipment_name ? `<div class="src-meta">${icon('equipment', 12)} ${esc(s.equipment_name)}</div>` : ''}
            <div class="src-excerpt">${esc(s.excerpt)}</div>
          </div>`;
      }).join('')}
    </div>
    <div class="text-muted" style="margin-top:14px;font-size:11.5px">
      Cập nhật ${esc(formatDateTime(new Date().toISOString()))}
    </div>`;
}
