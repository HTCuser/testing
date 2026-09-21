import { esc } from './ui.js';

let ORG_PARENT = 'CTCP Thủy điện Hủa Na';
let ORG_UNIT = 'Phân xưởng VH-SC Hủa Na';

export function setOrg(name, unit) {
  if (name) ORG_PARENT = name;
  if (unit) ORG_UNIT = unit;
}

function letterhead() {
  return `
    <div class="hdr">
      <div class="org">
        <div class="parent">${esc(ORG_PARENT)}</div>
        <div class="unit">${esc(ORG_UNIT)}</div>
      </div>
      <div class="natl">
        <div class="country">Cộng hoà xã hội chủ nghĩa Việt Nam</div>
        <div class="motto">Độc lập - Tự do - Hạnh phúc</div>
      </div>
    </div>`;
}

/* Đầu phiếu thao tác: mẫu hiện hành của nhà máy chỉ có tên đơn vị, không có
   quốc hiệu, nên dùng riêng thay vì letterhead() dùng chung cho quy trình. */
function ticketHead() {
  return `
    <div class="hdr-unit">
      <div class="parent">${esc(ORG_PARENT)}</div>
      <div class="unit">${esc(ORG_UNIT)}</div>
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

/* Gộp các bước liên tiếp cùng một Mục để đổ rowspan cho cột "Mục".
   Dòng bỏ trống Mục được coi là nối tiếp hạng mục phía trên. */
function groupBySection(rows) {
  const groups = [];
  let current = null;
  rows.forEach((row) => {
    const name = (row.section || '').trim();
    if (!current || (name && name !== current.name)) {
      current = { name: name || (current ? current.name : ''), rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  });
  return groups;
}

function handoverTable() {
  return `
    <table class="tbl-handover">
      <thead><tr>
        <th style="width:32mm">Thời gian</th>
        <th style="width:38mm">Đơn vị</th>
        <th style="width:42mm">Họ tên</th>
        <th>Nội dung</th>
      </tr></thead>
      <tbody>${blankRows(3, 4)}</tbody>
    </table>`;
}

function numberedBlock(items, blanks) {
  const lines = items.map((t, i) => `<div class="num-line">${i + 1}. ${esc(t)}</div>`);
  for (let i = 0; i < blanks; i += 1) {
    lines.push(`<div class="num-line">${items.length + i + 1}. <span class="fill"></span></div>`);
  }
  return lines.join('');
}

function dateLine() {
  return '<div class="date-line"><i>Ngày ...... tháng ...... năm ............</i></div>';
}

export function printOperationTicket(form) {
  const rows = form.rows || [];
  const groups = groupBySection(rows);
  let step = 0;
  const body = groups.map((g) => g.rows.map((row, i) => {
    step += 1;
    return `
    <tr>
      ${i === 0 ? `<td class="center muc" rowspan="${g.rows.length}">${esc(g.name)}</td>` : ''}
      <td>${esc(row.target)}</td>
      <td class="center">${step}</td>
      <td>${esc(row.action)}${row.note ? `<div><i>${esc(row.note)}</i></div>` : ''}</td>
      <td></td><td></td><td></td><td></td><td></td>
    </tr>`;
  }).join('')).join('');

  const cautions = form.notes ? [form.notes] : [];
  const conditions = form.conditions || [];

  openSheet(`Phiếu thao tác — ${form.title}`, `
    ${ticketHead()}
    <h1 class="doc-title">Phiếu thao tác</h1>

    <div class="meta">
      <div><span class="label">Tên phiếu thao tác:</span> ${esc(form.title)}</div>
      <div><span class="label">Mục đích thao tác:</span> ${esc(form.purpose || '')}</div>
      <div><span class="label">Thời gian dự kiến:</span></div>
      <div class="indent">Bắt đầu: ...... giờ ...... Ngày ...... tháng ...... năm ............</div>
      <div class="indent">Kết thúc: ...... giờ ...... Ngày ...... tháng ...... năm ............</div>
      <div><span class="label">Đơn vị đề nghị thao tác:</span>
        ${form.requesting_unit ? esc(form.requesting_unit) : '<span class="dotted"></span>'}</div>
    </div>

    <table class="tbl-roles">
      <tbody>
        <tr><td>Người viết phiếu:</td><td class="fillcell"></td>
            <td>Chức vụ:</td><td class="fillcell"></td></tr>
        <tr><td>Người duyệt phiếu:</td><td class="fillcell"></td>
            <td>Chức vụ:</td><td class="fillcell"></td></tr>
        <tr><td>Người giám sát:</td><td class="fillcell"></td>
            <td>Chức vụ:</td><td class="fillcell"></td></tr>
        <tr><td>Người thao tác:</td><td class="fillcell"></td>
            <td>Chức vụ:</td><td class="fillcell"></td></tr>
      </tbody>
    </table>

    <div class="lbl">Điều kiện cần có để thực hiện:</div>
    ${numberedBlock(conditions, 1)}

    <div class="lbl">Lưu ý: (nếu có)</div>
    ${numberedBlock(cautions, cautions.length ? 1 : 2)}

    <div class="lbl">Giao nhận, nghiệm thu đường dây, thiết bị điện trước khi thao tác: (nếu có)</div>
    ${handoverTable()}

    <div class="lbl">Trình tự hạng mục thao tác:</div>
    <table class="tbl-steps">
      <thead>
        <tr>
          <th rowspan="2" style="width:10mm">Mục</th>
          <th rowspan="2" style="width:22mm"></th>
          <th colspan="2">Trình tự thao tác</th>
          <th rowspan="2" style="width:16mm">Đã thực hiện</th>
          <th colspan="2">Thời gian</th>
          <th colspan="2">Người</th>
        </tr>
        <tr>
          <th style="width:9mm">Bước</th>
          <th>Nội dung thao tác</th>
          <th style="width:14mm">Bắt đầu</th>
          <th style="width:14mm">Kết thúc</th>
          <th style="width:15mm">Ra lệnh</th>
          <th style="width:15mm">Nhận lệnh</th>
        </tr>
      </thead>
      <tbody>${body}${blankRows(rows.length ? 2 : 14, 9)}</tbody>
    </table>

    <div class="lbl">Giao nhận, nghiệm thu đường dây, thiết bị điện sau thao tác: (nếu có)</div>
    ${handoverTable()}

    <div class="lbl">Các sự kiện bất thường trong thao tác:</div>
    <div class="num-line"><span class="fill"></span></div>
    <div class="num-line"><span class="fill"></span></div>

    <div class="sign-block">
      ${dateLine()}
      <div class="sign-row">
        <div class="sign-box">
          <div class="role">Người viết phiếu</div>
          <div class="hint">(Ký và ghi rõ họ tên)</div>
          <div class="space"></div>
        </div>
        <div class="sign-box">
          <div class="role">Người duyệt phiếu</div>
          <div class="hint">(Ký và ghi rõ họ tên)</div>
          <div class="space"></div>
        </div>
      </div>
    </div>

    <div class="sign-block">
      <div class="sign-head">
        <span>Người thực hiện thao tác:</span>
        ${dateLine()}
      </div>
      <div class="sign-row">
        <div class="sign-box">
          <div class="role">Người giám sát</div>
          <div class="hint">(Ký và ghi rõ họ tên)</div>
          <div class="space"></div>
        </div>
        <div class="sign-box">
          <div class="role">Người thao tác</div>
          <div class="hint">(Ký và ghi rõ họ tên)</div>
          <div class="space"></div>
        </div>
      </div>
    </div>

    <div class="note">Sơ đồ: Thể hiện sơ đồ các thiết bị liên quan đến thao tác,
      chỉ kèm theo phiếu thao tác nếu Người duyệt phiếu yêu cầu.</div>`);
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
