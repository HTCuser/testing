"""Sinh câu trả lời từ các đoạn truy hồi được.

Có ANTHROPIC_API_KEY thì dùng Claude để tổng hợp câu trả lời kèm trích dẫn.
Không có key thì trả về chế độ trích lược: ghép các đoạn liên quan nhất kèm
nguồn, vẫn dùng được cho tra cứu nhanh mà không phụ thuộc dịch vụ ngoài.
"""
from __future__ import annotations

from .. import config
from .index import Hit, complete_record

SYSTEM_PROMPT = """Bạn là trợ lý kỹ thuật của Nhà máy Thủy điện Hủa Na, phục vụ vận hành viên, \
kỹ thuật viên xử lý sự cố và thợ sửa chữa.

Nguyên tắc bắt buộc:
1. CHỈ trả lời dựa trên các đoạn tài liệu được cung cấp trong <tai_lieu>. Tuyệt đối không suy diễn \
thông số kỹ thuật, trị số chỉnh định, hay trình tự thao tác không có trong tài liệu.
2. Nếu tài liệu không đủ căn cứ, hãy nói rõ "Tài liệu hiện có chưa đủ căn cứ để trả lời" và nêu \
cần bổ sung tài liệu gì. Không được đoán.
3. Mỗi khẳng định kỹ thuật phải kèm trích dẫn dạng [1], [2] tương ứng số hiệu đoạn tài liệu.
4. Với câu hỏi về trình tự thao tác hoặc xử lý sự cố, trả lời theo các bước được đánh số, đúng \
thứ tự trong quy trình.
5. Nhắc lại các cảnh báo an toàn có trong tài liệu khi chúng liên quan tới câu hỏi.
6. Trả lời bằng tiếng Việt, văn phong kỹ thuật, đi thẳng vào việc. Viết gọn từng ý nhưng không \
được lược bớt bước xử lý hay trường hợp nào có trong tài liệu.
7. Phân biệt chính xác từng chức năng bảo vệ theo mã (87T, 87TN, 87GT, 87G… là các chức năng \
khác nhau dù tên gần giống). Không bao giờ lấy hiện tượng, nguyên nhân hay cách xử lý của chức \
năng này để trả lời cho chức năng khác. Nếu câu hỏi gọi tên chung chung mà tài liệu có nhiều chức \
năng khớp, trả lời cho chức năng khớp sát nhất với cách gọi của người hỏi, nêu rõ mã của nó ở đầu \
câu trả lời, rồi liệt kê ngắn các chức năng gần giống để người hỏi chọn lại nếu cần.
8. Nhãn trong ngoặc vuông ở đầu mỗi dòng, ví dụ [Bảo vệ so lệch (87T) tác động], cho biết dòng \
đó thuộc sự cố/thiết bị nào. "(tiếp)" nghĩa là phần nối tiếp của cùng bản ghi đó.
9. Với câu hỏi xử lý một sự cố/bảo vệ cụ thể: trình bày TRƯỚC trình tự xử lý riêng của đúng sự \
cố đó (phần "Xử lý" trong bản ghi của nó, đủ mọi bước, giữ nguyên các cấp nếu có như cấp 1 báo tín \
hiệu / cấp 2 cắt máy), SAU ĐÓ mới đến các nguyên tắc chung áp dụng cho nhóm thiết bị.
10. Khi tài liệu phân chia cách xử lý theo trường hợp (ví dụ: chỉ một bảo vệ nội bộ tác động / hai \
bảo vệ nội bộ cùng tác động / bảo vệ ngoài nội bộ tác động), phải trình bày ĐỦ TẤT CẢ các trường hợp, \
mỗi trường hợp một mục mở đầu bằng điều kiện nhận biết. Không tự chọn một trường hợp: người vận hành \
tại hiện trường mới là người xác định trường hợp nào đang xảy ra.
11. Đây là công cụ tra cứu hỗ trợ. Khi câu trả lời liên quan tới thao tác trên thiết bị đang mang \
điện hoặc đang vận hành, kết thúc bằng một dòng nhắc thực hiện theo phiếu thao tác đã được duyệt \
và mệnh lệnh của Trưởng ca."""


def build_context(hits: list[Hit]) -> str:
    blocks = []
    sent: dict[str, int] = {}  # dòng đã gửi → số hiệu đoạn chứa nó
    for i, hit in enumerate(hits, start=1):
        location = []
        if hit.heading:
            location.append(f"mục: {hit.heading}")
        if hit.page:
            location.append(f"trang {hit.page}")
        meta = f" ({', '.join(location)})" if location else ""
        # Hai nửa của một bản ghi thường cùng lọt top: sau khi ghép, đoạn sau
        # trùng hẳn đoạn trước. Giữ số hiệu (để trích dẫn khớp danh sách nguồn
        # trên giao diện) nhưng không gửi lặp nội dung.
        lines = complete_record(hit).split("\n")
        fresh = [ln for ln in lines if ln not in sent]
        if not fresh:
            body = f"(cùng nội dung với đoạn [{sent[lines[0]]}])"
        else:
            body = "\n".join(fresh)
            for ln in fresh:
                sent.setdefault(ln, i)
        blocks.append(f"<doan id=\"{i}\" nguon=\"{hit.doc_title}{meta}\">\n{body}\n</doan>")
    return "\n\n".join(blocks)


def answer(
    question: str, hits: list[Hit], *, quota_reason: str = ""
) -> tuple[str, str]:
    """Trả về (nội dung trả lời, chế độ).

    quota_reason khác rỗng nghĩa là đã hết hạn mức: vẫn trả về tài liệu truy hồi
    được, chỉ không tổng hợp thành câu trả lời.
    """
    if not hits:
        return (
            "Chưa tìm thấy tài liệu nào liên quan tới câu hỏi này trong thư viện kỹ thuật.\n\n"
            "Gợi ý: kiểm tra lại từ khoá, hoặc tải bổ sung tài liệu/quy trình liên quan vào mục "
            "**Thư viện kỹ thuật**.",
            "khong_co_ket_qua",
        )
    if quota_reason:
        return (
            _extractive(hits) + f"\n\n> _{quota_reason} "
            "Các đoạn tài liệu liên quan vẫn được liệt kê đầy đủ ở trên._",
            "het_han_muc",
        )
    if not config.generation_enabled():
        return _extractive(hits), "trich_luoc"
    try:
        return _with_claude(question, hits), "claude"
    except Exception as exc:  # pragma: no cover - phụ thuộc dịch vụ ngoài
        return (
            _extractive(hits)
            + f"\n\n> _Không gọi được mô hình sinh câu trả lời ({exc.__class__.__name__}), "
            "hệ thống đã chuyển sang chế độ trích lược tài liệu._",
            "trich_luoc",
        )


def _with_claude(question: str, hits: list[Hit]) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    # Trần số token trả lời chỉ là giới hạn trên, không làm tăng chi phí của câu
    # trả lời ngắn. Đặt thấp thì câu trả lời đủ các trường hợp xử lý sự cố bị cắt
    # cụt — mà phần bị cắt lại thường là các bước cuối.
    message = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"<tai_lieu>\n{build_context(hits)}\n</tai_lieu>\n\n"
                    f"Câu hỏi của người dùng: {question}"
                ),
            }
        ],
    )
    text = "".join(block.text for block in message.content if block.type == "text").strip()
    if message.stop_reason == "max_tokens":
        # Không bao giờ để câu trả lời xử lý sự cố bị cụt mà người đọc không biết.
        text += ("\n\n> **Câu trả lời bị cắt do quá dài.** Các bước phía sau chưa được liệt kê — "
                 "mở tài liệu nguồn bên dưới để đọc đủ trình tự xử lý.")
    return text


def _extractive(hits: list[Hit]) -> str:
    lines = [
        "Chưa bật mô hình sinh câu trả lời, dưới đây là các đoạn tài liệu liên quan nhất:",
        "",
    ]
    for i, hit in enumerate(hits[:5], start=1):
        where = hit.heading or (f"trang {hit.page}" if hit.page else "")
        header = f"**[{i}] {hit.doc_title}**" + (f" — _{where}_" if where else "")
        lines.append(header)
        lines.append(hit.excerpt or hit.text[:400])
        lines.append("")
    return "\n".join(lines).strip()
