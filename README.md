# Trợ lý kỹ thuật — Nhà máy Thủy điện Hủa Na

Hệ thống RAG (Retrieval-Augmented Generation) cho thư viện kỹ thuật nhà máy, kèm website hỗ trợ
công tác **vận hành**, **xử lý sự cố** và **bảo dưỡng sửa chữa**.

Giao diện tham khảo bố cục và phối màu của SehoPlus: thanh điều hướng xanh teal đậm, vùng nội dung
nền sáng, thẻ bo góc, nút nhấn màu cam.

---

## Hệ thống làm được gì

### Công tác vận hành

| Yêu cầu | Đáp ứng trong hệ thống |
|---|---|
| Tra cứu nhanh tài liệu kỹ thuật thiết bị | **Trợ lý kỹ thuật** hỏi đáp bằng tiếng Việt tự nhiên, trả lời kèm trích dẫn nguồn; **Thư viện kỹ thuật** tra theo tên, thẻ, thiết bị, phân loại |
| Tra cứu quy trình vận hành thiết bị | **Quy trình vận hành** — từng bước có đánh số, biện pháp an toàn, điều kiện áp dụng, in được ra giấy |
| Xử lý nhanh sự cố, bất thường | **Xử lý sự cố** có ô "Tra cứu nhanh theo hiện tượng": mô tả hiện tượng đang gặp → ra ngay hồ sơ và quy trình liên quan |
| Tích luỹ tình huống và bài học kinh nghiệm | Hồ sơ sự cố phân theo nguồn: *theo quy trình*, *kinh nghiệm Hủa Na*, *bài học từ nhà máy khác*. Người dùng tự thêm, sửa, xoá; nội dung mới được lập chỉ mục ngay để tra cứu |
| In phiếu thao tác mẫu theo từng dạng công tác | **Phiếu thao tác, cô lập** → in ra khổ A4 đúng thể thức (quốc hiệu, bảng trình tự, ô ký xác nhận) |
| Lấy mẫu cô lập thiết bị cho phiếu lệnh công tác | Loại biểu mẫu *Phiếu cô lập thiết bị*, bảng có cột ký cô lập và ký khôi phục |

### Công tác sửa chữa

| Yêu cầu | Đáp ứng trong hệ thống |
|---|---|
| Thợ sửa chữa tra cứu tài liệu kỹ thuật thiết bị | Cùng **Trợ lý kỹ thuật** và **Thư viện**; mỗi thiết bị có trang hồ sơ riêng gom đủ tài liệu, quy trình, sự cố đã gặp |
| Tra cứu quy trình bảo dưỡng, sửa chữa | **Bảo dưỡng, sửa chữa** — quy trình bảo dưỡng định kỳ theo thiết bị, có biện pháp an toàn và in được |

Toàn bộ nội dung do người dùng tạo (quy trình, hồ sơ sự cố, biểu mẫu) đều **tự động được lập chỉ mục**
và trở thành nguồn tri thức cho trợ lý — thêm một hồ sơ sự cố hôm nay thì ca trực đêm nay đã tra
cứu được.

---

## Cài đặt và chạy

Yêu cầu: Python 3.10 trở lên.

```bash
git clone <repo> && cd testing
./run.sh
```

Mở trình duyệt tại <http://localhost:8000>.

Chạy thủ công nếu không dùng `run.sh`:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m backend.seed          # nạp dữ liệu mẫu Hủa Na (tuỳ chọn)
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Tài liệu API tự sinh: <http://localhost:8000/docs>

### Cấu hình

Sao chép `.env.example` thành `.env` và điền các giá trị cần thiết. **Hệ thống chạy được đầy đủ mà
không cần bất kỳ khoá API nào** — khi đó tra cứu dùng BM25 chạy hoàn toàn offline và trả về các đoạn
tài liệu liên quan nhất thay vì câu trả lời tổng hợp.

| Biến | Tác dụng khi bật |
|---|---|
| `ANTHROPIC_API_KEY` | Trợ lý tổng hợp câu trả lời mạch lạc từ các đoạn truy hồi, kèm trích dẫn `[1] [2]` |
| `EMBEDDING_PROVIDER` + khoá tương ứng | Thêm nhánh tìm kiếm ngữ nghĩa, tìm được cả đoạn diễn đạt khác từ nhưng cùng ý |

Hỗ trợ embedding: `voyage` (khuyến nghị cho tiếng Việt) hoặc `openai_compatible` (dùng được với
Ollama, LM Studio, vLLM chạy nội bộ — phù hợp khi nhà máy không cho dữ liệu ra ngoài).

---

## Cách hoạt động của RAG

```
Tài liệu (.pdf .docx .xlsx .csv .txt .md)          Bản ghi nghiệp vụ
        │                                    (quy trình, sự cố, biểu mẫu)
        ▼                                                │
  Trích xuất văn bản                         Kết xuất thành văn bản có cấu trúc
        │                                                │
        └────────────────┬───────────────────────────────┘
                         ▼
              Cắt đoạn theo tiêu đề mục
         (giữ nguyên khối các bước đánh số)
                         ▼
        ┌────────────────┴────────────────┐
        ▼                                 ▼
  Chỉ mục BM25                    Embedding (tuỳ chọn)
 unigram + bigram                   vector ngữ nghĩa
        └────────────────┬────────────────┘
                         ▼
             Hợp nhất xếp hạng (RRF)
           + giới hạn 3 đoạn / tài liệu
                         ▼
              Claude sinh câu trả lời
              (ràng buộc chỉ dùng tài liệu)
```

**Vì sao BM25 có bigram.** Từ tiếng Việt thường gồm nhiều âm tiết — "kích từ", "gối trục", "máy cắt",
"so lệch". Chỉ lập chỉ mục từng âm tiết sẽ mất hết ngữ nghĩa. Hệ thống lập chỉ mục cả unigram và
bigram âm tiết, đồng thời chuẩn hoá bỏ dấu nên vận hành viên gõ vội không dấu vẫn tìm đúng
("may cat dau cuc nhay do bao ve so lech" → ra đúng hồ sơ SC-02).

**Ràng buộc an toàn khi sinh câu trả lời.** Prompt hệ thống buộc mô hình chỉ trả lời dựa trên tài
liệu được cấp, không suy diễn thông số kỹ thuật hay trị số chỉnh định, phải nói rõ khi tài liệu
không đủ căn cứ, và nhắc thực hiện theo phiếu thao tác đã duyệt cùng mệnh lệnh Trưởng ca khi câu hỏi
liên quan tới thao tác trên thiết bị đang vận hành.

---

## Cấu trúc mã nguồn

```
backend/
  config.py            Cấu hình, đọc .env
  db.py                Schema SQLite và tiện ích truy vấn
  models.py            Schema dữ liệu vào/ra (Pydantic)
  seed.py              Dữ liệu mẫu NMTĐ Hủa Na
  main.py              Khởi tạo FastAPI, phục vụ giao diện tĩnh
  rag/
    textutils.py       Chuẩn hoá, bỏ dấu, tách unigram + bigram tiếng Việt
    extract.py         Trích xuất văn bản PDF / DOCX / XLSX / CSV / TXT / MD
    chunking.py        Cắt đoạn theo tiêu đề mục quy trình Việt Nam
    embeddings.py      Nhà cung cấp embedding (Voyage / OpenAI-compatible)
    index.py           Chỉ mục lai BM25 + vector, hợp nhất RRF
    indexer.py         Nạp tệp và bản ghi nghiệp vụ vào chỉ mục
    generator.py       Sinh câu trả lời bằng Claude, có chế độ trích lược dự phòng
  routers/             REST API từng phân hệ nghiệp vụ
frontend/
  index.html
  static/css/          app.css (giao diện), print.css (bản in A4)
  static/js/
    app.js             Khai báo tuyến và khởi động
    router.js          Định tuyến theo hash
    shell.js           Sidebar, thanh tiêu đề, chân trang
    ui.js              Tiện ích DOM, modal, toast, markdown rút gọn
    print.js           Dựng bản in phiếu thao tác / cô lập / quy trình
    pages/             Từng trang nghiệp vụ
data/                  SQLite, tệp tải lên (không đưa vào git)
```

Giao diện là SPA thuần ES module — **không cần bước build, không phụ thuộc npm**. Sửa file trong
`frontend/` rồi tải lại trình duyệt là thấy ngay.

---

## Điểm cần lưu ý khi triển khai thật

- **Dữ liệu mẫu chỉ để minh hoạ.** Các quy trình, hồ sơ sự cố và biểu mẫu trong `backend/seed.py`
  được viết theo văn phong quy trình vận hành để minh hoạ cách số hoá. Khi dùng thật phải thay bằng
  quy trình đã được phê duyệt của nhà máy.
- **PDF bản scan cần OCR trước khi tải lên.** Hệ thống chỉ đọc được lớp văn bản trong PDF; tài liệu
  scan ảnh sẽ báo lỗi nạp và hiện trong mục Cấu hình.
- **Chưa có phân quyền người dùng.** Mọi người truy cập được đều có quyền thêm, sửa, xoá. Trước khi
  mở rộng ra toàn nhà máy cần bổ sung đăng nhập và phân quyền theo chức danh (vận hành viên, trưởng
  ca, kỹ thuật viên).
- **Công cụ tra cứu hỗ trợ, không thay thế quy trình.** Mọi thao tác trên thiết bị vẫn phải theo
  phiếu thao tác đã được duyệt và mệnh lệnh của Trưởng ca.
