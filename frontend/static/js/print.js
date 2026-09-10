import { esc } from './ui.js';

const ORG_PARENT = 'CÔNG TY CỔ PHẦN THUỶ ĐIỆN HỦA NA';
const ORG_UNIT = 'PHÂN XƯỞNG VẬN HÀNH';

function letterhead() {
  return `
    <div class="hdr">
      <div class="org">
        <div class="parent">${ORG_PARENT}</div>
        <div class="unit">${ORG_UNIT}</div>
      </div>
      <div class="natl">
        <div class="country">Cộng hoà xã hội chủ nghĩa Việt Nam</div>
        <div class="motto">Độc lập - Tự do - Hạnh phúc</div>
      </div>
    </div>`;
}

function openSheet(title, inner) {
  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) {
    alert('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up cho trang này.');
    return;
  }
  win.document.write(`<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/css/print.css">
</head><body>
<div class="print-bar">
  <span>Bản in: ${esc(title)}</span>
  <button onclick="window.print()">In phiếu</button>
  <button class="ghost" onclick="window.close()">Đóng</button>
</div>
<div class="sheet">${inner}</div>
</body></html>`);
  win.document.close();
}

function blankRows(count, columns) {
  return Array.from({ length: count }, () => `<tr>${'<td class="blank"></td>'.repeat(columns)}</tr>`).join('');
}

function signBlock(roles) {
  return `<div class="sign-row">${roles.map((r) => `
    <div class="sign-box">
      <div class="role">${esc(r)}</div>
      <div class="hint">(Ký, ghi rõ họ tên)</div>
      <div class="space"></div>
    </div>`).join('')}</div>`;
}

function safetyList(items) {
  if (!items?.length) return '';
  return `<h2 class="sec">Biện pháp an toàn bắt buộc</h2>
    <ul class="plain">${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------- phiếu thao tác */

export function printOperationForm(form) {
  const rows = form.rows || [];
  const body = rows.map((row, i) => `
    <tr>
      <td class="tt">${i + 1}</td>
      <td>${esc([row.target, row.action].filter(Boolean).join(' — '))}
        ${row.note ? `<div><i>Lưu ý: ${esc(row.note)}</i></div>` : ''}</td>
      <td></td><td></td>
    </tr>`).join('');

  openSheet(`Phiếu thao tác — ${form.title}`, `
    ${letterhead()}
    <h1 class="doc-title">Phiếu thao tác</h1>
    <div class="doc-sub">Số: ......... /PTT-${new Date().getFullYear()}</div>

    <div class="meta">
      <div><span class="label">Dạng công tác:</span> ${esc(form.work_type || form.title)}</div>
      <div><span class="label">Thiết bị thao tác:</span> ${esc(form.equipment_name || '..............................')}</div>
      <div><span class="label">Mục đích thao tác:</span> ${esc(form.purpose || '..............................')}</div>
      <div><span class="label">Người ra lệnh:</span> <span class="dotted"></span>
           <span class="label" style="min-width:34mm"> Chức danh:</span> <span class="dotted"></span></div>
      <div><span class="label">Người giám sát thao tác:</span> <span class="dotted"></span></div>
      <div><span class="label">Người thao tác:</span> <span class="dotted"></span></div>
      <div><span class="label">Bắt đầu lúc:</span> ...... giờ ...... ngày ...... tháng ...... năm ......
           <span class="label" style="min-width:26mm"> Kết thúc lúc:</span> ...... giờ ...... ngày ...... tháng ...... năm ......</div>
    </div>

    ${form.conditions ? `<h2 class="sec">Điều kiện thực hiện</h2><p>${esc(form.conditions)}</p>` : ''}
    ${safetyList(form.safety)}

    <h2 class="sec">Trình tự thao tác</h2>
    <table>
      <thead><tr>
        <th style="width:12mm">TT</th>
        <th>Nội dung thao tác</th>
        <th style="width:26mm">Thời gian</th>
        <th style="width:32mm">Ký xác nhận</th>
      </tr></thead>
      <tbody>${body}${blankRows(rows.length ? 3 : 12, 4)}</tbody>
    </table>

    ${form.notes ? `<div class="note">Ghi chú: ${esc(form.notes)}</div>` : ''}
    <div class="note">Phiếu chỉ có hiệu lực khi đã được duyệt và có lệnh của Trưởng ca.</div>

    ${signBlock(['Người ra lệnh', 'Người giám sát', 'Người thao tác'])}`);
}

/* --------------------------------------------------------------- phiếu cô lập */

export function printIsolationForm(form) {
  const rows = form.rows || [];
  const body = rows.map((row, i) => `
    <tr>
      <td class="tt">${i + 1}</td>
      <td>${esc(row.target)}</td>
      <td>${esc(row.action)}${row.note ? `<div><i>${esc(row.note)}</i></div>` : ''}</td>
      <td></td><td></td>
    </tr>`).join('');

  openSheet(`Phiếu cô lập — ${form.title}`, `
    ${letterhead()}
    <h1 class="doc-title">Phiếu cô lập thiết bị</h1>
    <div class="doc-sub">Kèm theo Phiếu công tác số: ......... /PCT-${new Date().getFullYear()}</div>

    <div class="meta">
      <div><span class="label">Tên công việc:</span> ${esc(form.title)}</div>
      <div><span class="label">Thiết bị cô lập:</span> ${esc(form.equipment_name || '..............................')}</div>
      <div><span class="label">Mục đích:</span> ${esc(form.purpose || '..............................')}</div>
      <div><span class="label">Đơn vị công tác:</span> <span class="dotted"></span></div>
      <div><span class="label">Người chỉ huy trực tiếp:</span> <span class="dotted"></span></div>
      <div><span class="label">Thời gian cô lập:</span> ...... giờ ...... ngày ...... tháng ...... năm ......</div>
    </div>

    ${form.conditions ? `<h2 class="sec">Điều kiện</h2><p>${esc(form.conditions)}</p>` : ''}
    ${safetyList(form.safety)}

    <h2 class="sec">Biện pháp cô lập và khôi phục</h2>
    <table>
      <thead><tr>
        <th style="width:12mm">TT</th>
        <th style="width:52mm">Vị trí / thiết bị</th>
        <th>Biện pháp cô lập</th>
        <th style="width:26mm">Ký cô lập</th>
        <th style="width:26mm">Ký khôi phục</th>
      </tr></thead>
      <tbody>${body}${blankRows(rows.length ? 3 : 12, 5)}</tbody>
    </table>

    ${form.notes ? `<div class="note">Ghi chú: ${esc(form.notes)}</div>` : ''}
    <div class="note">
      Chỉ bàn giao hiện trường cho đơn vị công tác sau khi đã thực hiện đủ các biện pháp cô lập nêu trên
      và kiểm tra không còn điện áp, không còn áp lực dư.
    </div>

    ${signBlock(['Trưởng ca', 'Người cho phép', 'Người chỉ huy trực tiếp'])}`);
}

/* ------------------------------------------------------------------ quy trình */

export function printProcedure(proc) {
  const steps = proc.steps || [];
  const body = steps.map((step, i) => `
    <tr>
      <td class="tt">${i + 1}</td>
      <td>${esc(step.text)}${step.note ? `<div><i>Lưu ý: ${esc(step.note)}</i></div>` : ''}</td>
      <td></td>
    </tr>`).join('');

  openSheet(proc.title, `
    ${letterhead()}
    <h1 class="doc-title">${esc(proc.kind_label || 'Quy trình')}</h1>
    <div class="doc-sub">${esc(proc.title)}${proc.code ? ` (Mã: ${esc(proc.code)})` : ''}</div>

    <div class="meta">
      ${proc.equipment_name ? `<div><span class="label">Thiết bị:</span> ${esc(proc.equipment_name)}</div>` : ''}
      ${proc.source_ref ? `<div><span class="label">Căn cứ:</span> ${esc(proc.source_ref)}</div>` : ''}
      <div><span class="label">Người thực hiện:</span> <span class="dotted"></span></div>
      <div><span class="label">Ngày thực hiện:</span> ...... / ...... / ..........</div>
    </div>

    ${proc.summary ? `<h2 class="sec">Mục đích</h2><p>${esc(proc.summary)}</p>` : ''}
    ${proc.conditions ? `<h2 class="sec">Điều kiện áp dụng</h2><p>${esc(proc.conditions)}</p>` : ''}
    ${safetyList(proc.safety)}

    <h2 class="sec">Trình tự thực hiện</h2>
    <table>
      <thead><tr>
        <th style="width:12mm">TT</th>
        <th>Nội dung công việc</th>
        <th style="width:32mm">Xác nhận</th>
      </tr></thead>
      <tbody>${body || blankRows(10, 3)}</tbody>
    </table>

    ${signBlock(['Người thực hiện', 'Trưởng ca'])}`);
}

/* ------------------------------------------------------------- hồ sơ sự cố */

export function printIncident(inc) {
  const section = (label, items) => (items?.length
    ? `<h2 class="sec">${esc(label)}</h2><ul class="plain">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '');

  openSheet(`Hồ sơ sự cố — ${inc.title}`, `
    ${letterhead()}
    <h1 class="doc-title">Phiếu hướng dẫn xử lý sự cố</h1>
    <div class="doc-sub">${esc(inc.title)}${inc.code ? ` (Mã: ${esc(inc.code)})` : ''}</div>

    <div class="meta">
      ${inc.equipment_name ? `<div><span class="label">Thiết bị:</span> ${esc(inc.equipment_name)}</div>` : ''}
      <div><span class="label">Mức độ:</span> ${esc(inc.severity_label || '')}</div>
      <div><span class="label">Nguồn:</span> ${esc(inc.source_label || '')}</div>
      ${inc.source_ref ? `<div><span class="label">Căn cứ:</span> ${esc(inc.source_ref)}</div>` : ''}
    </div>

    ${section('Hiện tượng, dấu hiệu nhận biết', inc.symptoms)}
    ${section('Nguyên nhân có thể', inc.causes)}

    <h2 class="sec">Trình tự xử lý</h2>
    <table>
      <thead><tr><th style="width:12mm">TT</th><th>Thao tác xử lý</th><th style="width:32mm">Xác nhận</th></tr></thead>
      <tbody>${(inc.actions || []).map((a, i) => `
        <tr><td class="tt">${i + 1}</td><td>${esc(a)}</td><td></td></tr>`).join('') || blankRows(8, 3)}</tbody>
    </table>

    ${inc.prevention ? `<h2 class="sec">Biện pháp phòng ngừa</h2><p>${esc(inc.prevention)}</p>` : ''}
    ${inc.lesson ? `<h2 class="sec">Bài học kinh nghiệm</h2><p>${esc(inc.lesson)}</p>` : ''}

    ${signBlock(['Người lập', 'Trưởng ca'])}`);
}
