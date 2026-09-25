"""Cắt tài liệu thành các đoạn (chunk) phục vụ truy hồi."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import CHUNK_OVERLAP, CHUNK_SIZE

# Ngưỡng "đã đủ đầy": dưới mức này thì mục mới vẫn được gộp tiếp vào chunk đang
# dựng, tránh sinh ra hàng loạt chunk vụn từ các mục ngắn.
MIN_FILL = int(CHUNK_SIZE * 0.4)

# Các dòng bảng đã kết xuất là bản ghi độc lập (một thông số, hoặc một hiện
# tượng kèm nguyên nhân và cách xử lý). Gộp nhiều bản ghi không liên quan vào
# một đoạn làm loãng mật độ từ khoá và khiến kết quả trả về dài dòng, nên các
# đoạn toàn bản ghi được giữ ngắn hơn đoạn văn xuôi.
RECORD_CHUNK_SIZE = max(320, int(CHUNK_SIZE * 0.45))

# Chồng lấn tối đa khi phải lùi về đầu một câu dài.
MAX_SENTENCE_OVERLAP = max(CHUNK_OVERLAP * 4, 600)
_SENTENCE_START = re.compile(r"(?<=[.;!?])\s+|\n")

_RECORD_RE = re.compile(r"^(?:\[[^\]]{1,80}\]\s*)?[^:\n]{1,60}:\s*\S")

# Tiêu đề mục trong quy trình kỹ thuật Việt Nam: "## Tiêu đề", "Điều 12.",
# "Chương III", "PHẦN II ...", "5.2.1 Trình tự thao tác".
#
# Đánh số nhiều cấp ("5.2", "5.2.1") được coi là tiêu đề mục; đánh số một cấp
# ("1.", "2)") thì không, vì trong quy trình vận hành đó gần như luôn là bước
# thao tác chứ không phải đầu mục.
_HEADING_RE = re.compile(
    r"^(?:#{1,6}\s+.+"
    r"|(?:Điều|ĐIỀU|Chương|CHƯƠNG|Phần|PHẦN|Mục|MỤC)\s+[\dIVXLC]+.{0,120}"
    r"|\d+(?:\.\d+){1,3}[.)]?\s+\S.{0,120})$"
)


@dataclass
class Chunk:
    ord: int
    page: int | None
    heading: str
    text: str


def _is_heading(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 140:
        return False
    if _HEADING_RE.match(line):
        return True
    letters = [c for c in line if c.isalpha()]
    return len(letters) >= 6 and all(c.isupper() for c in letters)


def _is_record(text: str) -> bool:
    """Đoạn văn bản có phải gồm các bản ghi bảng đã kết xuất hay không."""
    lines = [ln for ln in text.split("\n") if ln.strip()]
    if not lines:
        return False
    return sum(bool(_RECORD_RE.match(ln)) for ln in lines) * 2 > len(lines)


def _clean_heading(line: str) -> str:
    return re.sub(r"^#{1,6}\s+", "", line.strip())


def split_blocks(text: str) -> list[tuple[str, str]]:
    """Gom văn bản thành các khối (tiêu đề của khối, nội dung khối)."""
    blocks: list[tuple[str, str]] = []
    heading = ""
    buffer: list[str] = []

    def flush(current_heading: str) -> None:
        body = "\n".join(buffer).strip()
        if body:
            blocks.append((current_heading, body))
        buffer.clear()

    for line in text.split("\n"):
        if _is_heading(line):
            flush(heading)
            heading = _clean_heading(line)
            buffer.append(heading)
        else:
            buffer.append(line)
    flush(heading)
    return blocks


def chunk_text(text: str, page: int | None = None, start_ord: int = 0) -> list[Chunk]:
    chunks: list[Chunk] = []
    order = start_ord
    current = ""
    current_heading = ""

    def emit(body: str, heading: str) -> None:
        nonlocal order
        chunks.append(Chunk(ord=order, page=page, heading=heading, text=body.strip()))
        order += 1

    for heading, body in split_blocks(text):
        for unit in _split_oversized(body):
            if not current:
                current, current_heading = unit, heading
                continue
            starts_new_section = heading != current_heading and len(current) >= MIN_FILL
            cap = RECORD_CHUNK_SIZE if _is_record(unit) and _is_record(current) else CHUNK_SIZE
            if not starts_new_section and len(current) + len(unit) + 1 <= cap:
                current = f"{current}\n{unit}"
                continue
            body, dangling = _detach_group_headings(current)
            if not body:
                # Mới chỉ có tiêu đề nhóm: giữ lại để đi cùng nội dung của nó.
                current = f"{current}\n{unit}"
                continue
            emit(body, current_heading)
            if dangling:
                overlap = dangling
            elif _CONTINUATION_RE.match(unit):
                # Mảnh sau đã tự mang nhãn bản ghi, lặp thêm câu cuối của mảnh
                # trước chỉ chèn một câu không nhãn vào đầu đoạn.
                overlap = ""
            else:
                overlap = _tail(body) if CHUNK_OVERLAP and not starts_new_section else ""
            current = f"{overlap}\n{unit}".strip() if overlap else unit
            current_heading = heading
    if current.strip():
        emit(current, current_heading)
    return chunks


def _detach_group_headings(text: str) -> tuple[str, str]:
    """Tách các dòng tiêu đề nhóm ("— Bảo vệ ... tác động") treo ở cuối đoạn.

    Tiêu đề nhóm thuộc về nội dung đứng sau nó. Để nó ở cuối đoạn trước thì
    đoạn đó mang tên một sự cố mà nội dung lại là cách xử lý của sự cố khác —
    cả truy hồi lẫn mô hình sinh câu trả lời đều bị dẫn sai.
    """
    lines = text.rstrip().split("\n")
    dangling: list[str] = []
    while lines and lines[-1].strip().startswith("— "):
        dangling.insert(0, lines.pop().strip())
    return "\n".join(lines).strip(), "\n".join(dangling)


def _split_oversized(body: str) -> list[str]:
    """Tách khối dài thành các mảnh không vượt CHUNK_SIZE.

    Ưu tiên ranh giới đoạn, rồi đến ranh giới dòng, cuối cùng mới đến câu. Bước
    theo dòng là để giữ nguyên các dòng bảng đã kết xuất: mỗi dòng là một bản
    ghi trọn vẹn (thông số, hoặc hiện tượng - nguyên nhân - xử lý), cắt giữa
    dòng sẽ làm mất nửa bản ghi và truy hồi ra mảnh vô nghĩa.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    units: list[str] = []
    for para in paragraphs:
        if len(para) <= CHUNK_SIZE:
            units.append(para)
            continue
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if len(lines) > 1:
            for line in lines:
                if len(line) <= CHUNK_SIZE:
                    units.append(line)
                else:
                    units.extend(_split_record_line(line))
            continue
        units.extend(_split_record_line(para))
    return units


_LABEL_RE = re.compile(r"^\[([^\]]{1,120})\]\s*")
_CONTINUATION_RE = re.compile(r"^\[[^\]]{1,120}\][^\n]{0,40}\(tiếp\)")
# Tên trường trong bản ghi đã kết xuất: đầu bản ghi hoặc ngay sau "; ".
_FIELD_RE = re.compile(r"(?:^|;\s)([^:;\[\]]{1,30}):\s")


def _split_record_line(line: str) -> list[str]:
    """Tách một bản ghi quá dài, lặp lại nhãn ở đầu từng mảnh.

    Bản ghi xử lý sự cố thường dài hơn một đoạn chỉ mục: phần "Xử lý" bị tách
    sang đoạn sau. Mảnh sau không mang nhãn thì không ai biết nó thuộc sự cố
    nào — tệ hơn, mảnh đó lại nằm sát tiêu đề sự cố kế tiếp nên bị đọc nhầm
    thành cách xử lý của sự cố khác (87T bị hiểu thành 87TN).
    """
    match = _LABEL_RE.match(line)
    if not match:
        return _split_sentences(line)
    label = match.group(1)
    body = line[match.end():]
    # Chừa chỗ cho nhãn lặp lại để mảnh sau không vượt kích thước đoạn.
    room = max(CHUNK_SIZE // 2, CHUNK_SIZE - len(label) - 40)
    pieces = _split_sentences(body, limit=room)
    out = [f"[{label}] {pieces[0]}"]
    consumed = pieces[0]
    for piece in pieces[1:]:
        fields = _FIELD_RE.findall(consumed)
        field = fields[-1].strip() if fields else ""
        prefix = f"[{label}] {field} (tiếp): " if field else f"[{label}] (tiếp) "
        out.append(prefix + piece)
        consumed = f"{consumed} {piece}"
    return out


def _split_sentences(para: str, limit: int = CHUNK_SIZE) -> list[str]:
    sentences = re.split(r"(?<=[.;:!?])\s+", para)
    out: list[str] = []
    current = ""
    for sentence in sentences:
        while len(sentence) > limit:
            out.append(sentence[:limit])
            sentence = sentence[limit:]
        if not current:
            current = sentence
        elif len(current) + len(sentence) + 1 <= limit:
            current = f"{current} {sentence}"
        else:
            out.append(current)
            current = sentence
    if current:
        out.append(current)
    return out


def _tail(text: str) -> str:
    """Phần lặp lại ở đầu đoạn sau, để câu trả lời không bị mất ở chỗ giáp ranh."""
    if len(text) <= CHUNK_OVERLAP:
        return text

    # Khối bản ghi: chồng lấn phải là trọn một bản ghi. Cắt theo số ký tự sẽ lặp
    # lại nửa bản ghi, sinh ra đoạn mở đầu cụt ngang vừa không đọc được vừa
    # không tìm được.
    if _is_record(text):
        last = text.rsplit("\n", 1)[-1].strip()
        return last if len(last) <= CHUNK_SIZE // 2 else ""

    # Văn xuôi: lùi về đầu câu hoặc đầu dòng nếu có. Không coi dấu hai chấm là
    # hết câu: "Trường hợp X: làm Y" — phần trước dấu hai chấm là điều kiện.
    tail = text[-CHUNK_OVERLAP:]
    boundary = _SENTENCE_START.search(tail)
    if boundary:
        return tail[boundary.end():]
    # Phần đuôi nằm trọn trong một câu dài: lấy cả câu đó, không bắt đầu giữa
    # câu. Quy trình hay viết điều kiện ở đầu câu ("Trường hợp có hai bảo vệ
    # nội bộ tác động: ...") — cắt mất đầu câu là mất điều kiện, phần còn lại
    # đọc như thuộc về trường hợp đứng ngay sau nó.
    window = text[-MAX_SENTENCE_OVERLAP:-CHUNK_OVERLAP]
    starts = list(_SENTENCE_START.finditer(window))
    if starts:
        return window[starts[-1].end():] + tail
    cut = tail.find(" ")
    return tail[cut + 1:] if cut != -1 else tail
