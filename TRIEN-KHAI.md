# Hướng dẫn triển khai — Trợ lý kỹ thuật NMTĐ Hủa Na

Tài liệu này dành cho người cài đặt và quản trị phần mềm. Đi lần lượt từ trên xuống.

## Tóm tắt

| Việc | File / chỗ làm |
|---|---|
| Cài lần đầu (tải thư viện, tạo CSDL) | `run.bat` |
| Biến máy thành máy chủ: tự chạy khi bật máy, tự sao lưu, mở tường lửa | `cai-dat-may-chu.bat` |
| Tạo tài khoản quản trị đầu tiên | Mở phần mềm trên trình duyệt lần đầu |
| Thêm tài khoản, phân quyền, xem nhật ký, sao lưu, dọn dữ liệu thử | Menu **Quản trị** |
| Cập nhật phần mềm lên bản mới | `cap-nhat.bat` |
| Dừng / chạy lại phần mềm | `dung-may-chu.bat` / `khoi-dong-may-chu.bat` |
| Sao lưu ngay / khôi phục từ bản sao lưu | `sao-luu.bat` / `khoi-phuc.bat` |
| Quên mật khẩu (kể cả quản trị) | `tai-khoan.bat` (chạy trên máy chủ) |
| Gỡ chế độ máy chủ | `go-cai-dat-may-chu.bat` |
| Chuyển cả thư mục tài liệu sang PDF, tên không dấu (file gốc giữ nguyên) | `chuyen-pdf-khong-dau.bat` — kéo thả thư mục vào file |

Các file `.bat` tự xin quyền Administrator khi cần. Gặp hộp thoại hỏi quyền thì bấm **Yes**.

---

## 1. Chuẩn bị máy chủ

- Máy tính Windows 10/11 bật 24/24, đặt ở phòng điều khiển trung tâm hoặc phòng kỹ thuật, cắm qua **UPS**.
- RAM từ 16 GB trở lên (Ollama chạy mô hình bge-m3 cần khoảng 2 GB).
- Nhờ IT cấp **địa chỉ IP cố định** cho máy, ví dụ `192.168.1.50`. Các máy khác sẽ vào bằng địa chỉ này.
- Máy chủ đặt ở **mạng văn phòng / mạng nội bộ nhà máy**, không đặt trong mạng điều khiển (SCADA),
  và **không mở ra Internet**.
- Nên có ổ thứ hai (ổ D:) hoặc ổ cứng gắn ngoài để chứa bản sao lưu.

## 2. Cài phần mềm

1. Cài **Git**: <https://git-scm.com/download/win>.
2. Cài **Python 3.10 trở lên**: <https://www.python.org/downloads/>. Khi cài, nhớ tích
   **"Add python.exe to PATH"**.
3. Cài **Ollama**: <https://ollama.com/download>. Sau đó mở Command Prompt và tải mô hình:
   ```
   ollama pull bge-m3
   ```
4. Lấy mã nguồn về, ví dụ vào `D:\HuaNa`:
   ```
   cd /d D:\
   git clone -b claude/rag-hydropower-plant-website-2isikm https://github.com/HTCuser/testing.git HuaNa
   ```
   Nếu đã có sẵn thư mục phần mềm trên máy khác thì chép cả thư mục sang cũng được. Bỏ thư mục
   `.venv` khi chép, vì `run.bat` sẽ tạo lại.
5. Tạo file cấu hình: chép `.env.example` thành `.env` rồi mở bằng Notepad để sửa:
   - `ANTHROPIC_API_KEY=...` nếu dùng trợ lý tổng hợp câu trả lời. Đọc kỹ mục 8 trước khi điền.
   - `SAO_LUU_DIR=E:\SaoLuu-HuaNa`: thư mục sao lưu, đặt ở **ổ khác** ổ cài phần mềm.
6. Nháy đúp `run.bat`. Lần đầu mất vài phút để tải thư viện. Khi thấy dòng
   `Application startup complete`, **đóng cửa sổ này lại**.

## 3. Cài chế độ máy chủ

Nháy đúp **`cai-dat-may-chu.bat`** rồi bấm Yes khi được hỏi quyền. Script sẽ:

- mở cổng 8000 trên tường lửa Windows cho các máy trong mạng truy cập;
- tạo tác vụ **"HuaNa - Tro ly ky thuat"** để phần mềm tự chạy khi bật máy, kể cả khi chưa ai
  đăng nhập Windows, và tự chạy lại nếu phần mềm bị tắt bất thường;
- tự bật Ollama cùng phần mềm;
- tạo tác vụ **"HuaNa - Sao luu du lieu"**: sao lưu lúc 11:50 và 23:50 hằng ngày;
- tắt chế độ ngủ (Sleep) khi cắm điện;
- khởi động phần mềm, rồi in ra các địa chỉ để máy khác truy cập.

Chạy lại file này bao nhiêu lần cũng được, ví dụ sau khi đổi `SAO_LUU_DIR` trong `.env`.

Nhật ký chạy của máy chủ ghi ở `data\logs\may-chu.log`, nhật ký sao lưu ở `data\logs\sao-luu.log`.

## 4. Tài khoản và phân quyền

Lần đầu mở phần mềm, trình duyệt hiện trang **Tạo tài khoản quản trị**. Tài khoản này chính là
tài khoản quản trị hệ thống. Sau đó vào **Quản trị → Người dùng → Thêm tài khoản** để tạo tài
khoản cho từng người:

| Vai trò | Được làm |
|---|---|
| Vận hành viên | Tra cứu, hỏi trợ lý, lập phiếu, tích bước, hoàn thành phiếu, ghi nhật ký. Tự huỷ được phiếu mới lập của mình |
| Trưởng ca | Như vận hành viên, cộng thêm: **duyệt, huỷ phiếu**; sửa phiếu thao tác mẫu; sửa, xoá nhật ký của người khác |
| Kỹ thuật viên | Như vận hành viên, cộng thêm: sửa phiếu thao tác mẫu; **quản lý tài liệu thư viện**, thiết bị, quy trình |
| Quản trị hệ thống | Toàn quyền: tài khoản, cấu hình số phiếu và mẫu in, sao lưu, dọn dữ liệu |

- Mỗi người **một tài khoản riêng**, không dùng chung. Nhật ký hệ thống ghi lại ai lập phiếu,
  ai duyệt, ai tích bước nào, ai xoá tài liệu nào.
- Mật khẩu ban đầu do quản trị đặt. Người dùng phải đổi mật khẩu ngay lần đăng nhập đầu.
- Chức danh ghi trong tài khoản được điền sẵn vào ô "Người viết phiếu". Khi duyệt phiếu, nếu
  phiếu chưa ghi người duyệt thì phần mềm điền người đang bấm duyệt.
- Máy phòng điều khiển dùng chung cho cả kíp: **hết ca thì đăng xuất**. Bấm vào tên mình ở góc
  dưới bên trái rồi chọn Đăng xuất. Đóng trình duyệt cũng tự đăng xuất. Để máy không dùng quá
  12 giờ thì phải đăng nhập lại (đổi bằng `SESSION_IDLE_HOURS` trong `.env`).
- Người nghỉ việc hoặc chuyển bộ phận: **khoá** tài khoản thay vì xoá, để giữ tên trên các
  phiếu cũ.
- Quên mật khẩu:
  - Người dùng thường: quản trị vào Quản trị → Người dùng → Sửa → nhập mật khẩu mới.
  - Quên mật khẩu quản trị: chạy `tai-khoan.bat` **trên máy chủ** rồi nhập tên tài khoản cần đặt lại.

## 5. Chuẩn bị dữ liệu thật, dọn dữ liệu thử

1. Tải lên các quy trình, tài liệu **đã được phê duyệt**. File PDF là bản scan ảnh thì phải
   chạy OCR (nhận dạng chữ) trước khi tải lên.
2. Nhập phiếu thao tác mẫu. Import Excel là nhanh nhất; có file Excel mẫu tải về ngay dưới
   bảng bước.
3. Vào **Quản trị → Dọn dữ liệu thử** rồi tích những gì cần xoá: phiếu lập thử, nhật ký ghi
   thử, lịch sử hỏi, dữ liệu mẫu minh hoạ, nhật ký hệ thống giai đoạn thử. Phần mềm **tự sao
   lưu trước khi xoá**. Xoá phiếu thì số phiếu đếm lại từ 001.
4. Muốn số phiếu bắt đầu từ một số khác, vào **Phiếu thao tác → Cấu hình số phiếu → Số tiếp theo**.
5. Vào **Cấu hình → Dựng lại chỉ mục tra cứu** một lần.

## 6. Sao lưu và khôi phục

- Máy chủ tự sao lưu lúc 11:50 và 23:50. Muốn sao lưu ngay thì vào **Quản trị → Sao lưu**
  hoặc chạy `sao-luu.bat`.
- Mỗi lần sao lưu tạo một thư mục `<SAO_LUU_DIR>\<ngày_giờ>\huana.db`. Đây là bản chụp toàn bộ
  CSDL (phiếu, nhật ký, tài khoản, phiếu mẫu, chỉ mục), lấy an toàn ngay cả khi phần mềm đang chạy.
- Tài liệu gốc, mẫu in, tệp đính kèm được chép vào `<SAO_LUU_DIR>\tep\`. Lần sau chỉ chép thêm
  tệp mới.
- Bản chụp CSDL cũ hơn 30 ngày tự xoá (đổi bằng `SAO_LUU_GIU_NGAY`). Phần mềm luôn giữ ít nhất
  7 bản gần nhất.
- Mỗi tháng một lần, nên chép thư mục sao lưu ra một nơi khác nữa (ổ mạng, ổ cứng cất tủ).
- Trang Quản trị → Sao lưu báo đỏ nếu thư mục sao lưu nằm cùng ổ đĩa với phần mềm.

**Khôi phục** (khi máy hỏng dữ liệu, hoặc xoá nhầm):

1. Chạy `dung-may-chu.bat`.
2. Chạy `khoi-phuc.bat`, chọn số thứ tự bản cần khôi phục, rồi gõ `c` để xác nhận. Dữ liệu
   đang có được cất lại thành file `data\huana.db.truoc-khoi-phuc-...`, không bị mất.
3. Chạy `khoi-dong-may-chu.bat`.

**Chuyển sang máy chủ mới:**

1. Cài phần mềm trên máy mới theo mục 2 và 3.
2. Dừng phần mềm trên máy mới.
3. Chép cả thư mục sao lưu của máy cũ sang, rồi đặt `SAO_LUU_DIR` trỏ tới thư mục đó.
4. Chạy `khoi-phuc.bat`.

## 7. Cập nhật phần mềm

Làm **ngoài giờ thao tác**, vì phần mềm tắt khoảng 1–2 phút:

1. Thử bản mới trên máy cá nhân trước.
2. Trên máy chủ, nháy đúp **`cap-nhat.bat`**. Script tự làm lần lượt: dừng phần mềm → sao lưu →
   `git pull` → cài thư viện mới → chạy lại.
3. Trên các máy đang mở phần mềm, bấm **Ctrl + F5** một lần.
4. Nếu ghi chú của bản cập nhật có yêu cầu, vào **Cấu hình → Dựng lại chỉ mục tra cứu**.

`git pull` báo lỗi thì phần mềm giữ nguyên bản cũ và vẫn chạy lại bình thường. Lỗi thường do
có người sửa tay file trong thư mục phần mềm, hoặc do mất mạng.

## 8. An toàn thông tin

- **Dữ liệu gửi ra ngoài:** khi có `ANTHROPIC_API_KEY`, mỗi câu hỏi cho trợ lý gửi kèm vài đoạn
  tài liệu liên quan tới dịch vụ Claude (Anthropic) trên Internet để tổng hợp câu trả lời. Cần
  xin phép công ty trước khi bật. Nếu không được phép, để trống `ANTHROPIC_API_KEY`: phần mềm
  vẫn tra cứu bình thường (từ khoá + Ollama chạy ngay trên máy chủ), không có gì ra khỏi mạng
  nội bộ.
- File `.env` chứa API key: không gửi file này, không chụp màn hình nội dung của nó.
- Chỉ mở phần mềm trong mạng nội bộ. Không mở cổng (NAT) ra Internet.
- Tài khoản quản trị chỉ cấp cho 1–2 người.
- Định kỳ xem **Quản trị → Nhật ký hệ thống** để kiểm tra các lần đăng nhập sai và các lần xoá dữ liệu.

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Máy khác không vào được, máy chủ vào được | Kiểm tra IP máy chủ (`ipconfig`), chạy lại `cai-dat-may-chu.bat` để mở lại tường lửa. Máy khác phải chung mạng với máy chủ |
| Không máy nào vào được | Xem `data\logs\may-chu.log`. Chạy `khoi-dong-may-chu.bat` |
| Trang đứng ở "Đang khởi động hệ thống" | Bấm Ctrl + F5. Nếu hiện khung đỏ, chụp màn hình gửi hỗ trợ |
| Trợ lý không tìm theo nghĩa (trang Cấu hình báo đỏ phần embedding) | Ollama chưa chạy: khởi động lại máy chủ, hoặc chạy `ollama serve` |
| Quên mật khẩu quản trị | `tai-khoan.bat` trên máy chủ |
| Cần tắt máy chủ để bảo trì | Tắt máy bình thường. Khi bật lại, phần mềm tự chạy |
| Muốn chạy tay để xem lỗi trực tiếp | `dung-may-chu.bat` rồi `run.bat`. Xong thì đóng `run.bat`, chạy `khoi-dong-may-chu.bat` |
