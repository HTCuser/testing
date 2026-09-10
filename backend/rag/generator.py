"""Sinh câu trả lời từ các đoạn truy hồi được.

Có ANTHROPIC_API_KEY thì dùng Claude để tổng hợp câu trả lời kèm trích dẫn.
Không có key thì trả về chế độ trích lược: ghép các đoạn liên quan nhất kèm
nguồn, vẫn dùng được cho tra cứu nhanh mà không phụ thuộc dịch vụ ngoài.
"""
from __future__ import annotations

from .. import config
from .index import Hit

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
6. Trả lời bằng tiếng Việt, văn phong kỹ thuật, ngắn gọn, đi thẳng vào việc.
7. Đây là công cụ tra cứu hỗ trợ. Khi câu trả lời liên quan tới thao tác trên thiết bị đang mang \
điện hoặc đang vận hành, kết thúc bằng một dòng nhắc thực hiện theo phiếu thao tác đã được duyệt \
và mệnh lệnh của Trưởng ca."""


def build_context(hits: list[Hit]) -> str:
    blocks = []
    for i, hit in enumerate(hits, start=1):
        location = []
        if hit.heading:
            location.append(f"mục: {hit.heading}")
        if hit.page:
            location.append(f"trang {hit.page}")
        meta = f" ({', '.join(location)})" if location else ""
        blocks.append(
            f"<doan id=\"{i}\" nguon=\"{hit.doc_title}{meta}\">\n{hit.text}\n</doan>"
        )
    return "\n\n".join(blocks)


def answer(question: str, hits: list[Hit]) -> tuple[str, str]:
    """Trả về (nội dung trả lời, chế độ)."""
    if not hits:
        return (
            "Chưa tìm thấy tài liệu nào liên quan tới câu hỏi này trong thư viện kỹ thuật.\n\n"
            "Gợi ý: kiểm tra lại từ khoá, hoặc tải bổ sung tài liệu/quy trình liên quan vào mục "
            "**Thư viện kỹ thuật**.",
            "khong_co_ket_qua",
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
    message = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=2000,
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
    return "".join(block.text for block in message.content if block.type == "text").strip()


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
