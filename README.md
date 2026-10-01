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
| **Phiếu thao tác** | Dashboard kiểm soát theo ngày; lập phiếu từ PTT mẫu; Lập → Duyệt → Tiếp nhận → Hoàn thành; VHV tích từng bước đã thực hiện; tải ra đúng mẫu phiếu Word của nhà máy |
| **Phiếu thao tác mẫu** | Nhóm → Tên phiếu → bảng Mục / Địa điểm / Bước / Nội dung; Import Excel |
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

### Triển khai làm máy chủ dùng chung

Xem **[TRIEN-KHAI.md](TRIEN-KHAI.md)**: cài máy chủ (`cai-dat-may-chu.bat` — tự chạy khi bật
máy, tự sao lưu, mở tường lửa), tài khoản và phân quyền, dọn dữ liệu thử, sao lưu / khôi phục,
cập nhật (`cap-nhat.bat`).

### Đăng nhập và phân quyền

Lần đầu mở phần mềm sẽ tạo tài khoản quản trị. Quản trị thêm tài khoản cho từng người ở menu
**Quản trị** với một trong bốn vai trò: Vận hành viên, Trưởng ca (thêm quyền duyệt, huỷ phiếu),
Kỹ thuật viên (thêm quyền quản lý tài liệu, thiết bị), Quản trị hệ thống. Máy chủ kiểm quyền ở
mọi yêu cầu (`backend/auth.py`, bảng `RULES`); giao diện ẩn nút mà tài khoản không có quyền.
Mọi thao tác ghi (lập, duyệt, huỷ phiếu, tích bước, xoá tài liệu, đăng nhập...) được ghi vào
**Nhật ký hệ thống**. Quên mật khẩu quản trị: `tai-khoan.bat` trên máy chủ.

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

### Phiếu thao tác

Tổ chức theo cách làm của NKVH điện tử, gồm hai mục:

**Phiếu thao tác mẫu** — ba cột **Nhóm → Tên phiếu → bảng bước**. Nhóm do người dùng tự đặt (lần
đầu có sẵn 4 nhóm: vận hành bình thường / bảo dưỡng, sửa chữa × phiếu cô lập / tái lập). Bảng
bước gồm **Mục, Địa điểm, Bước, Nội dung**:

- Sửa trực tiếp trên bảng; **Thêm**, **Xoá** các dòng đã tích chọn; **⤒ ↑ ↓ ⤓** đưa dòng chọn lên
  đầu, lên, xuống, xuống cuối; **Ghi** để lưu.
- **Import Excel**: file có các cột Mục, Địa điểm, Bước, Nội dung, và tuỳ chọn thêm hai cột
  **Điều kiện cần để thực hiện**, **Lưu ý** (tìm hàng tiêu đề trong 10 hàng đầu; không có tiêu đề
  thì hiểu các cột A–F theo thứ tự đó). Ở hai cột sau, mỗi ô có chữ là một điều kiện / một lưu ý,
  không gắn với bước cùng hàng; số thứ tự gõ sẵn trong ô được bỏ, khi in phiếu tự đánh lại 1., 2.…
  Có nút **Tải file Excel mẫu** ngay dưới bảng bước.
- **Điều kiện cần để thực hiện** và **Lưu ý** của mẫu (mỗi dòng một ý) được chép sang phiếu lập từ
  mẫu và in vào chỗ `{{Điều kiện}}`, `{{Lưu ý}}` của mẫu in.
- Số bước tự đánh liên tục. Ghi Mục (I, II…) và Địa điểm ở bước mở đầu, các bước sau để trống
  là thuộc cùng mục, cùng địa điểm.
- PTT mẫu được lập chỉ mục: hỏi trợ lý "trình tự đóng điện tủ điều khiển cửa van sự cố H2" là ra.

**Phiếu thao tác** — lập từ một phiếu mẫu (chép sẵn tên, mục đích, điều kiện, các bước) hoặc
nhập trống, rồi đi qua các mốc:

| Trạng thái | Việc làm được |
|---|---|
| **Mới lập** | Sửa mọi nội dung và các bước |
| **Đã duyệt** | Nội dung giữ nguyên; tích bước đầu tiên là tự tiếp nhận |
| **Đang thực hiện** | Vận hành viên **tích từng bước** khi làm xong — ghi giờ tích, người ra lệnh (người giám sát) và người nhận lệnh (người thao tác); tích vượt bước thì hỏi lại |
| **Hoàn thành** / **Đã huỷ** | Chỉ xem, tải về |

Trang chi tiết như NKVH: số phiếu, phân loại **Kế hoạch / Đột xuất**, đơn vị cấp phiếu, người
viết, người duyệt, người giám sát, người thao tác kèm chức vụ và mốc thời gian lập, duyệt, tiếp
nhận, hoàn thành; mục đích, thời gian dự kiến, đơn vị đề nghị, điều kiện, lưu ý; sự kiện bất
thường trong thao tác; tài liệu đính kèm. **Dashboard** kiểm soát phiếu theo ngày: phiếu trong
ngày, hoàn thành, đang duyệt/thực hiện, **phiếu tồn** (quá ngày mà chưa hoàn thành), tiến độ
từng phiếu, theo người thao tác, 7 ngày gần nhất.

**Cấu hình số phiếu**: định dạng mặc định `###/YYYY/{PL}/HHC` → `054/2026/KH/HHC`,
`055/2026/ĐX/HHC` (`###` số thứ tự, `YYYY` năm, `{PL}` là KH hoặc ĐX). Chọn được dùng chung
hay tách dãy số cho kế hoạch và đột xuất; đặt số tiếp theo để nối tiếp sổ giấy; sang năm mới tự
đánh lại. Số chỉ cấp lúc lưu phiếu, hai người lưu cùng lúc vẫn không trùng.

**Tải Word** ra đúng tờ phiếu thao tác của nhà máy (mẫu dựng từ phiếu thật "Đưa MBA T2-TD92 vào
làm việc", đã bỏ hết nội dung riêng): điền số phiếu, người, giờ, điều kiện đánh số, hai bảng
giao nhận, nghiệm thu trước / sau thao tác, và dựng lại bảng trình tự theo đúng số bước — cột
Mục và Địa điểm gộp dọc như phiếu giấy, bước đã thực hiện đánh dấu X kèm tên người ra lệnh,
nhận lệnh. Như NKVH, cột thời gian chỉ ghi **giờ bắt đầu ở bước đầu tiên** (lúc tích bước đầu)
và **giờ kết thúc ở bước cuối cùng** (lúc tích bước cuối, khi đã tích đủ). Muốn dùng mẫu in khác: vào **Cấu hình số phiếu** → *Thay mẫu in khác*, đặt
các ô `{{Số phiếu}}`, `{{Người viết phiếu}}`… (danh sách đầy đủ trong hộp cấu hình); bảng trình
tự là bảng có cột "Nội dung" và "Bước" hoặc "Mục".

Chưa có chữ ký số và đăng nhập theo người dùng: ai mở phần mềm cũng bấm được Duyệt, Tiếp nhận,
Hoàn thành. Phần mềm ghi lại thời điểm, chưa ghi được *ai* bấm.

### Thông tin ban hành của quy trình

Mỗi tài liệu có **Mã hiệu**, **Số quyết định ban hành**, **Ngày ban hành**, lần ban hành. Để
trống lúc tải lên thì phần mềm tự đọc từ trang bìa (dòng "MÃ HIỆU: ...", "Quyết định số:
86/QĐ-HHC ngày ... tháng ... năm ..."; không đọc được ngày trong dòng quyết định thì lấy
"NGÀY HIỆU LỰC" in trên bìa) và báo đã điền ô nào. Nút **Sửa thông tin** trên trang chi tiết sửa được mọi thông tin (kể cả chuyển phân loại);
**Thay tệp** thay bằng bản sửa đổi mà giữ nguyên thông tin; **Nạp lại** đọc lại tệp và điền
các ô còn trống. Tìm theo mã hiệu hoặc số quyết định ngay ở ô tìm kiếm thư viện; trích dẫn
của trợ lý ghi kèm mã hiệu.

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

### Trang đứng ở "Đang khởi động hệ thống…" sau khi cập nhật

Do trình duyệt còn giữ vài file giao diện của bản cũ. Máy chủ nay gửi kèm `Cache-Control: no-cache`
để trình duyệt luôn hỏi lại, và trang tự nạp lại toàn bộ file giao diện một lần nếu không khởi
động được. Máy nào vẫn mở giao diện từ trước bản này thì bấm **Ctrl + F5** một lần.

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
         + ưu tiên đúng số hiệu thiết bị được hỏi
                         ▼
              Claude sinh câu trả lời
              (ràng buộc chỉ dùng tài liệu)
```

**Vì sao BM25 có bigram.** Từ tiếng Việt thường gồm nhiều âm tiết — "kích từ", "gối trục", "máy cắt",
"so lệch". Chỉ lập chỉ mục từng âm tiết sẽ mất hết ngữ nghĩa. Hệ thống lập chỉ mục cả unigram và
bigram âm tiết, đồng thời chuẩn hoá bỏ dấu nên vận hành viên gõ vội không dấu vẫn tìm đúng
("may cat dau cuc nhay do bao ve so lech" → ra đúng hồ sơ SC-02).

**Đúng thiết bị theo số hiệu.** Quy trình thường có các mục gần như giống hệt nhau cho từng thiết
bị cùng loại (máy cắt 901/902, tổ máy H1/H2). Từ khoá và vector ngữ nghĩa đều coi hai mục đó gần
như một, nên hỏi "xử lý sự cố không cắt được máy cắt 901 khi dừng máy" từng ra mục của 902 chỉ vì
mục đó trùng chữ "khi dừng máy". Nay số hiệu trong câu hỏi (901, H1, MC273, 231-3…) được tính
nặng hơn; sau khi hợp nhất, đoạn có số hiệu đó (nhất là ở tiêu đề mục) được cộng điểm, đoạn chỉ nêu
số hiệu "anh em" (chỉ khác chữ số cuối: 902, H2) bị trừ điểm; mô hình sinh câu trả lời cũng được
nhắc không lấy trình tự của thiết bị khác số hiệu.

**Đọc PDF quy trình.** PDF mất cấu trúc bảng và tiêu đề, nên khi nạp PDF hệ thống: bỏ dòng đầu
trang / chân trang lặp lại ở nhiều trang (tên công ty, mã hiệu, "Trang số: 12/124") — để lại thì
dòng in hoa đó bị coi là tiêu đề mục mới, cắt rời các bước khỏi mục của chúng; bỏ trang mục lục;
nối tiêu đề mục sang trang sau (các bước của mục 9.2.6 tràn sang 3–4 trang vẫn thuộc 9.2.6); không
coi dòng bị ngắt giữa câu ("9.2.8 đối với MC 902.") là tiêu đề. Vẫn nên tải bản Word khi có thể.

**Đưa trọn mục, kèm mục được dẫn chiếu.** Trúng một đoạn trong mục đánh số (9.2.6) thì mô hình
được đọc trọn mục đó (đủ mọi bước). Đoạn ghi "thực hiện theo các bước như mục 9.2.7" thì lấy kèm
mục 9.2.7, và mô hình phải đối chiếu tiêu đề mục được dẫn chiếu với thiết bị đang hỏi: quy trình
máy cắt đầu cực HHC-VH-QT-18 ghi "mục 9.2.7 đối với MC 901 hoặc mục 9.2.8 đối với MC 902" trong
khi 9.2.6 mới là của MC 901, 9.2.7 là của MC 902 — mô hình phải dùng mục đúng thiết bị và cảnh
báo chỗ dẫn chiếu sai.

**Tên sự cố, tên hệ thống trong câu hỏi.** Sau khi hợp nhất xếp hạng còn hai điều chỉnh: đoạn
có dòng tên sự cố / tên mục khớp gần trọn câu hỏi ("Áp lực dầu cao (> 185 Bar)" khi hỏi "...khi
áp lực dầu cao") được cộng điểm; câu hỏi gọi đúng tên hệ thống của một tài liệu ("van đĩa",
"máy cắt đầu cực") thì đoạn của tài liệu đó được ưu tiên hơn đoạn cùng chủ đề ở tài liệu khác. Số
hiệu tổ máy (H1) chỉ cộng nhẹ: bảng xử lý sự cố thường chung cho mọi tổ máy và không ghi "H1".

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
  auth.py              Đăng nhập, phiên, bảng phân quyền, nhật ký hệ thống
  saoluu.py            Sao lưu / khôi phục (python -m backend.saoluu)
  taikhoan.py          Đặt lại mật khẩu từ dòng lệnh (python -m backend.taikhoan)
  routers/auth.py      Đăng nhập, đổi mật khẩu, tạo quản trị lần đầu
  routers/admin.py     Người dùng, nhật ký hệ thống, sao lưu, dọn dữ liệu thử
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
    app.js             Khai báo tuyến và khởi động (đăng nhập trước khi dựng khung)
    session.js         Người đang đăng nhập, quyền (can), ẩn nút data-perm
    login.js           Màn hình đăng nhập, tạo quản trị, đổi mật khẩu
    router.js          Định tuyến theo hash
    shell.js           Sidebar, thanh tiêu đề, chân trang
    ui.js              Tiện ích DOM, modal, toast, markdown rút gọn
    print.js           Dựng bản in phiếu thao tác / cô lập / quy trình
    pages/             Từng trang nghiệp vụ
data/                  SQLite, tệp tải lên, log (không đưa vào git)
scripts/               Cài máy chủ Windows (PowerShell), vòng chạy nền
*.bat                  run, cai-dat-may-chu, cap-nhat, dung/khoi-dong-may-chu,
                       sao-luu, khoi-phuc, tai-khoan, go-cai-dat-may-chu
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
- **Mỗi người một tài khoản.** Không dùng chung tài khoản; nhật ký hệ thống chỉ có ý nghĩa khi
  biết đúng ai đã thao tác. Máy dùng chung phòng điều khiển: đăng xuất khi hết ca.
- **Sao lưu ra ổ khác.** Đặt `SAO_LUU_DIR` sang ổ khác ổ cài phần mềm; định kỳ chép thư mục sao
  lưu ra nơi thứ ba.
- **Dữ liệu gửi ra ngoài khi bật trợ lý tổng hợp** (có `ANTHROPIC_API_KEY`): cần công ty cho
  phép; không được phép thì để trống key, mọi thứ chạy nội bộ.
- **Công cụ tra cứu hỗ trợ, không thay thế quy trình.** Mọi thao tác trên thiết bị vẫn phải theo
  phiếu thao tác đã được duyệt và mệnh lệnh của Trưởng ca.
