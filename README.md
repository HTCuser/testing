# Trợ lý kỹ thuật — Nhà máy Thủy điện Hủa Na

Hệ thống RAG (Retrieval-Augmented Generation) cho thư viện kỹ thuật nhà máy, kèm website hỗ trợ
công tác **vận hành**, **xử lý sự cố** và **bảo dưỡng sửa chữa**.

Giao diện tham khảo bố cục và phối màu của SehoPlus: thanh điều hướng xanh teal đậm, vùng nội dung
nền sáng, thẻ bo góc, nút nhấn màu cam.

---

## Hệ thống làm được gì

Menu chia hai phần: **Thư viện kỹ thuật** (tài liệu để tra cứu) và **Nghiệp vụ** (việc vận hành
viên làm và ghi lại hằng ngày).

### Thư viện kỹ thuật

| Mục | Nội dung |
|---|---|
| **Quy trình VH & XLSC** | Các file quy trình vận hành và xử lý sự cố của nhà máy |
| **Quy trình BD, SC** | Quy trình, hướng dẫn bảo dưỡng và sửa chữa |
| **Tài liệu kỹ thuật** | Tài liệu nhà chế tạo, sơ đồ, bản vẽ, bài học kinh nghiệm |
| **Danh mục thiết bị** | Hồ sơ từng thiết bị, gom tài liệu và nhật ký liên quan |

Ba trang tài liệu dùng chung một kho, chỉ khác nhau ở phân loại tài liệu. Tài liệu nào cũng mở
đọc được ngay trên trình duyệt, tìm được bên trong, và là căn cứ trả lời của **Trợ lý kỹ thuật**.

### Nghiệp vụ

| Mục | Nội dung |
|---|---|
| **Phiếu thao tác** | **Dashboard** kiểm soát phiếu theo ngày (phiếu trong ngày, đã thực hiện, chưa xác nhận, phiếu tồn các ngày trước, theo người thao tác, 7 ngày gần nhất); **Phiếu đã lập**; **PTT mẫu** chia theo *vận hành bình thường / bảo dưỡng, sửa chữa* và *cô lập / tái lập* |
| **Thao tác vận hành** | Vận hành viên ghi lại thao tác đã làm: thời gian, ca kíp, thiết bị, số phiếu, người ra lệnh, người thực hiện, diễn biến, bất thường phát sinh |
| **Xử lý bất thường, sự cố** | Hiện tượng, nguyên nhân, trình tự xử lý, bài học của các bất thường/sự cố đã gặp |
| **Bảo dưỡng, sửa chữa** | Nội dung công việc, số phiếu công tác, vật tư thay thế, hư hỏng phát hiện, kết quả |

Mọi bản ghi nghiệp vụ **tự động được lập chỉ mục** ngay khi lưu: ghi một lần thao tác hôm nay thì
ca đêm hỏi trợ lý "lần trước đưa MBA T2 vào làm việc có vướng gì" đã tìm ra.

Các trang cũ **Quy trình vận hành / Bảo dưỡng** (quy trình nhập tay) và **Trình tự thao tác mẫu**
không còn trên menu vì trùng với thư viện quy trình và PTT mẫu dạng Word. Dữ liệu cũ vẫn giữ, trợ
lý vẫn tra cứu được, và vẫn mở được qua các đường dẫn `#/van-hanh`, `#/bao-duong`, `#/bieu-mau`.

---|---|
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

Yêu cầu duy nhất: **Python 3.10 trở lên**. Không cần Node.js, không cần database server,
không cần khoá API.

### Windows

Cài Python tại <https://www.python.org/downloads/> — khi cài **nhớ tích ô "Add python.exe to PATH"**.
Sau đó nháy đúp vào `run.bat`, hoặc chạy trong Command Prompt:

```bat
cd C:\duong\dan\toi\testing
run.bat
```

### Linux / macOS

```bash
cd /duong/dan/toi/testing
./run.sh
```

Lần chạy đầu mất vài phút để tải thư viện và nạp dữ liệu mẫu. Khi thấy dòng
`Application startup complete`, mở trình duyệt tại <http://localhost:8000>.
Các lần sau khởi động chỉ mất vài giây.

Nhấn `Ctrl + C` trong cửa sổ lệnh để dừng máy chủ.

### Chạy thủ công (nếu không dùng script)

```bash
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m backend.seed              # nạp dữ liệu mẫu Hủa Na (tuỳ chọn)
python -m backend.seed --xoa        # gỡ dữ liệu mẫu khi đã có tài liệu thật
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Tài liệu API tự sinh: <http://localhost:8000/docs>

### Xử lý sự cố khi cài đặt

| Hiện tượng | Cách xử lý |
|---|---|
| `Tải thư viện thất bại` / `ReadTimeoutError` | Mạng chậm hoặc bị chặn. Chạy lại script — các gói đã tải xong được dùng lại nên lần sau nhanh hơn. Nếu qua proxy: `set HTTPS_PROXY=http://<proxy>:<cổng>` (Windows) hoặc `export HTTPS_PROXY=...` (Linux) |
| `Address already in use` / cổng 8000 bận | Đổi cổng: `set PORT=8080` rồi chạy lại (Linux: `PORT=8080 ./run.sh`) |
| Windows hỏi cho phép qua tường lửa | Chọn **Allow** nếu muốn máy khác trong mạng nhà máy truy cập được; chọn Cancel nếu chỉ dùng trên máy này |
| Muốn nạp lại dữ liệu mẫu từ đầu | Xoá tệp `data/huana.db` rồi chạy lại script |

> **Gỡ dữ liệu mẫu khi triển khai thật.** Thiết bị, quy trình, hồ sơ sự cố và phiếu thao tác
> nạp sẵn là **nội dung minh hoạ do công cụ sinh ra, không phải quy trình đã được phê duyệt**.
> Khi nhà máy đã nạp tài liệu thật, chạy `python -m backend.seed --xoa` để gỡ chúng đi: để lại
> thì chúng vừa cạnh tranh sai trong kết quả tra cứu, vừa có nguy cơ bị vận hành viên đọc nhầm
> thành quy trình chính thức. Lệnh này chỉ xoá đúng các mã do công cụ tạo, không đụng tới tài
> liệu tải lên và bản ghi nhà máy tự nhập.

### Cho máy khác trong mạng nhà máy truy cập

Máy chủ đã lắng nghe trên mọi địa chỉ mạng. Xem IP của máy đang chạy
(`ipconfig` trên Windows, `ip a` trên Linux) rồi trên máy khác mở
`http://<IP-máy-chủ>:8000`, ví dụ `http://192.168.1.50:8000`.

### Cấu hình

Sao chép `.env.example` thành `.env` và điền các giá trị cần thiết. **Hệ thống chạy được đầy đủ mà
không cần bất kỳ khoá API nào** — khi đó tra cứu dùng BM25 chạy hoàn toàn offline và trả về các đoạn
tài liệu liên quan nhất thay vì câu trả lời tổng hợp.

Hệ thống gồm hai phân hệ cấu hình độc lập.

### Phân hệ 1 — Truy hồi tài liệu (bge-m3, chạy nội bộ)

Mặc định dùng **bge-m3** qua Ollama, xử lý tiếng Việt tốt và **tài liệu không ra khỏi mạng
nhà máy**.

**1. Cài Ollama** — tải tại <https://ollama.com/download> (Windows 10/11, macOS, Linux), chạy
trình cài đặt. Cài xong Ollama chạy nền và tự khởi động cùng máy, lắng nghe ở cổng `11434`.

**2. Tải mô hình** — mở Command Prompt:

```bash
ollama pull bge-m3          # 1,2 GB
ollama list                 # kiểm tra đã có bge-m3 chưa
```

Máy chật ổ đĩa có thể dùng bản nén `ollama pull bge-m3:q4_0` (422 MB), khi đó phải đặt
`OPENAI_EMBEDDING_MODEL=bge-m3:q4_0` trong `.env` cho khớp.

**3. Kiểm tra** — mở <http://localhost:11434> phải thấy dòng `Ollama is running`. Trên trang
**Cấu hình** của phần mềm, mục Embedding phải hiện nhãn xanh kèm số chiều vector.

**4. Dựng lại chỉ mục** — bấm **Dựng lại chỉ mục tra cứu** trên trang Cấu hình để sinh vector
cho tài liệu đã nạp trước đó. Chỉ cần làm lần đầu và mỗi khi đổi mô hình embedding.

Không cần GPU: bge-m3 là mô hình nhỏ, chạy trên CPU đủ nhanh cho việc lập chỉ mục và tra cứu.

Đặt Ollama trên máy khác thì sửa `OPENAI_BASE_URL` trỏ tới máy đó, và trên máy chạy Ollama
phải đặt biến môi trường `OLLAMA_HOST=0.0.0.0` (mặc định Ollama chỉ nghe localhost).

Ollama không chạy thì truy hồi **tự lùi về BM25** — hệ thống vẫn dùng được, trang Cấu hình báo
đỏ kèm lý do. Muốn tắt hẳn nhánh ngữ nghĩa: đặt `EMBEDDING_PROVIDER=none`.

### Phiếu thao tác lập từ mẫu Word

Mục **Phiếu thao tác** dùng chính file Word phiếu của nhà máy làm mẫu, phần mềm chỉ lo phần thay
đổi mỗi lần lập.

**1. Chuẩn bị mẫu.** Mở phiếu bằng Word, xoá giá trị cụ thể ở chỗ thay đổi mỗi lần lập và gõ
tên ô trong cặp ngoặc nhọn kép:

```
Số phiếu: {{Số phiếu}}
Người viết phiếu: {{Người viết phiếu}}      Chức vụ: {{Chức vụ người viết}}
Bắt đầu: {{Giờ bắt đầu}}   Ngày {{Ngày}} tháng {{Tháng}} năm {{Năm}}
```

Lưu file .docx rồi tải lên ở tab **Mẫu phiếu**. Bảng trình tự, logo, header, định dạng giữ
nguyên. Ô có thể nằm ở bất kỳ đâu, kể cả header/footer. Cùng một tên ô xuất hiện nhiều chỗ thì
được điền ở tất cả các chỗ. Tab **Mẫu phiếu** có nút tải **mẫu ví dụ** dựng từ phiếu "Đưa MBA
T2-TD92 vào làm việc", đã đặt sẵn các ô để xem cách làm.

| Tên ô | Phần mềm xử lý |
|---|---|
| `{{Số phiếu}}` | Tự cấp số, không nhập tay |
| `{{Ngày}}` `{{Tháng}}` `{{Năm}}` (cả ba) | Chọn một lần trên lịch, điền vào cả ba ô |
| Tên bắt đầu bằng "Ngày…" | Chọn trên lịch, điền dạng 26/09/2026 |
| Tên bắt đầu bằng "Giờ…" | Chọn giờ, điền dạng 08h30 |
| Tên có "nội dung", "ghi chú", "mục đích", "điều kiện", "lưu ý"… | Ô nhập nhiều dòng |
| Còn lại | Ô nhập một dòng, gợi ý lại các giá trị đã từng nhập |

**2. Số phiếu tự tăng.** Mỗi mẫu có định dạng số, mặc định `###/YYYY/KH/HHC` (`###` là số thứ tự,
`YYYY` là năm) → `054/2026/KH/HHC`. Các mẫu cùng định dạng dùng chung một dãy số như cùng một
quyển sổ phiếu, sang năm mới tự đánh lại từ 001. Số chỉ được cấp lúc bấm **Lưu**: hai người lưu
cùng lúc vẫn nhận hai số liên tiếp, không trùng. Bắt đầu dùng phần mềm giữa năm thì vào **Sửa**
mẫu, đặt **Số tiếp theo** để nối tiếp sổ phiếu giấy.

**3. Quản lý.** Phiếu đã lập xem được ngay trên trình duyệt, tải về Word để in, sửa nội dung (số
phiếu giữ nguyên), đánh dấu **Đã thực hiện** hoặc **Huỷ**. Phiếu lập sai thì huỷ chứ không xoá, để
dãy số không bị hổng. Mẫu đã dùng để lập phiếu thì không xoá được, để phiếu cũ còn xuất lại đúng
như lúc lập.

Mục **Trình tự thao tác mẫu** (trước đây tên là "Phiếu thao tác") vẫn giữ nguyên: đó là các
trình tự chuẩn làm căn cứ tra cứu cho trợ lý.

### Đọc tài liệu ngay trên trình duyệt

Trong trang chi tiết mỗi tài liệu, nút **MỞ TÀI LIỆU** hiển thị nguyên văn tài liệu ngay trên
trình duyệt, giữ bảng và hình vẽ — không phải tải về rồi mở bằng Word. PDF và tệp văn bản được
trình duyệt dựng trực tiếp; DOCX, XLSX và CSV được chuyển sang HTML ở phía máy chủ.

Bản chuyển đổi được lưu lại trong `data/index/xem/` và dựng sẵn ngay lúc nạp tài liệu, nên mở
lần nào cũng tức thì. Tệp gốc đổi thì bản cũ tự bỏ. Nút **Tải về** vẫn giữ nguyên tệp gốc cho
ai cần bản Word.

Máy chưa cài `mammoth` (`pip install -r requirements.txt`) vẫn mở được DOCX, nhưng bản dựng dự
phòng chỉ có chữ và bảng, không có hình.

### Dựng lại chỉ mục sau khi cập nhật phần mềm

Nút **Dựng lại chỉ mục tra cứu** trên trang Cấu hình **đọc lại toàn bộ tệp gốc** rồi cắt đoạn
lại từ đầu, chứ không chỉ nạp lại phần đã cắt trong CSDL. Cách trích xuất bảng và cắt đoạn còn
được cải tiến theo từng bản, nên sau mỗi lần `git pull` hãy bấm nút này một lần — không phải
xoá và tải lên lại từng tài liệu.

### Soi thứ hạng khi một câu hỏi tra ra sai

```bash
python -m backend.chandoan "áp lực dầu làm việc định mức là bao nhiêu" -- "Áp lực làm việc định mức"
```

Lệnh in thứ hạng của cùng một đoạn ở nhánh từ khoá, nhánh ngữ nghĩa và ở kết quả hợp nhất, nên
biết ngay lỗi nằm ở đâu thay vì đoán. Phần sau dấu `--` là từ khoá chắc chắn có trong đáp án.

### Phân hệ 2 — Sinh câu trả lời (Claude Haiku 4.5)

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `ANTHROPIC_API_KEY` | trống | Không có thì chỉ trả về đoạn tài liệu, không tổng hợp câu trả lời |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Mô hình sinh câu trả lời |
| `DAILY_ASK_LIMIT` | `100` | Hạn mức gọi mô hình mỗi ngày |
| `MONTHLY_ASK_LIMIT` | `3000` | Hạn mức gọi mô hình mỗi tháng |
| `TIMEZONE_OFFSET_HOURS` | `7` | Mốc đổi ngày/tháng theo giờ nhà máy |

Hạn mức chỉ đếm lượt **thực sự gọi ra dịch vụ ngoài**. Hết hạn mức thì tra cứu vẫn chạy bình
thường, chỉ lùi về chế độ trích lược — không khoá công cụ giữa ca trực. Mức đã dùng hiển thị
trên trang Cấu hình.

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
  docview.py           Dựng bản xem DOCX/XLSX/CSV để đọc thẳng trên trình duyệt
  phieu.py             Đọc ô {{...}} trong mẫu phiếu Word và điền giá trị
  routers/journal.py   Nhật ký thao tác vận hành, bảo dưỡng sửa chữa
  mau/                 Mẫu phiếu thao tác ví dụ
  chandoan.py          Soi thứ hạng truy hồi của một câu hỏi (công cụ dòng lệnh)
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
