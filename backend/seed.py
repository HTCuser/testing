"""Nạp dữ liệu mẫu cho Nhà máy Thủy điện Hủa Na.

Chạy: python -m backend.seed [--force]

Dữ liệu mẫu mô tả cấu hình thực tế của nhà máy (2×90 MW trên sông Chu, Quế Phong,
Nghệ An) và được viết theo văn phong quy trình vận hành để minh hoạ cách số hoá.
Nội dung mang tính tham khảo — khi triển khai thật cần thay bằng quy trình đã được
phê duyệt của nhà máy.
"""
from __future__ import annotations

import sys

from .db import init_db, query_one
from .rag.index import index
from .routers import forms as forms_router
from .routers import incidents as incidents_router
from .routers import procedures as procedures_router
from .models import EquipmentIn, FormIn, IncidentIn, ProcedureIn
from .routers.equipment import create_equipment

EQUIPMENT = [
    dict(
        code="H1-TUA", name="Tuabin tổ máy H1", system="Tuabin - Máy phát",
        location="Cao trình 155,0 — Gian máy", manufacturer="Dongfang Electric",
        model="Francis trục đứng", commissioned="2013",
        specs=[
            {"label": "Công suất định mức", "value": "91,8 MW"},
            {"label": "Cột nước tính toán", "value": "150 m"},
            {"label": "Lưu lượng qua tuabin", "value": "66,5 m³/s"},
            {"label": "Tốc độ định mức", "value": "375 v/ph"},
            {"label": "Tốc độ lồng tốc", "value": "700 v/ph"},
        ],
        notes="Tuabin Francis trục đứng, buồng xoắn kim loại, ống xả cong.",
    ),
    dict(
        code="H1-GEN", name="Máy phát tổ máy H1", system="Tuabin - Máy phát",
        location="Cao trình 160,5 — Gian máy", manufacturer="Dongfang Electric",
        model="SF90-16/6500", commissioned="2013",
        specs=[
            {"label": "Công suất biểu kiến", "value": "100 MVA"},
            {"label": "Công suất tác dụng", "value": "90 MW"},
            {"label": "Điện áp đầu cực", "value": "13,8 kV"},
            {"label": "Hệ số công suất", "value": "0,9"},
            {"label": "Kiểu làm mát", "value": "Không khí tuần hoàn kín, bộ làm mát nước"},
        ],
    ),
    dict(
        code="H1-EXC", name="Hệ thống kích từ tổ máy H1", system="Hệ thống kích từ",
        location="Phòng thiết bị điện — Cao trình 160,5",
        manufacturer="ABB", model="UNITROL 6000", commissioned="2013",
        specs=[
            {"label": "Kiểu kích từ", "value": "Tĩnh, chỉnh lưu có điều khiển (thyristor)"},
            {"label": "Điện áp kích từ định mức", "value": "220 V DC"},
            {"label": "Dòng kích từ định mức", "value": "1150 A"},
        ],
    ),
    dict(
        code="H1-GOV", name="Hệ thống điều tốc tổ máy H1", system="Hệ thống điều tốc",
        location="Sàn điều tốc — Cao trình 155,0",
        manufacturer="Dongfang", model="Điều tốc điện - thuỷ lực vi xử lý",
        commissioned="2013",
        specs=[
            {"label": "Áp lực dầu làm việc", "value": "6,3 MPa"},
            {"label": "Dung tích bình dầu áp lực", "value": "4,0 m³"},
            {"label": "Thời gian đóng cánh hướng", "value": "8 - 10 s"},
        ],
    ),
    dict(
        code="H1-MIV", name="Van bướm (MIV) tổ máy H1", system="Hệ thống dầu áp lực",
        location="Đầu buồng xoắn — Cao trình 148,0",
        manufacturer="Dongfang", model="DN 2600", commissioned="2013",
        specs=[
            {"label": "Đường kính danh nghĩa", "value": "2600 mm"},
            {"label": "Áp lực thiết kế", "value": "2,0 MPa"},
            {"label": "Thời gian đóng sự cố", "value": "≤ 60 s"},
        ],
    ),
    dict(
        code="H2-GEN", name="Máy phát tổ máy H2", system="Tuabin - Máy phát",
        location="Cao trình 160,5 — Gian máy", manufacturer="Dongfang Electric",
        model="SF90-16/6500", commissioned="2013",
        specs=[
            {"label": "Công suất tác dụng", "value": "90 MW"},
            {"label": "Điện áp đầu cực", "value": "13,8 kV"},
        ],
    ),
    dict(
        code="AT1", name="Máy biến áp chính T1", system="Thiết bị nhất thứ 220kV",
        location="Sân phân phối 220 kV", manufacturer="ABB", model="SFP10-100000/220",
        commissioned="2013",
        specs=[
            {"label": "Công suất", "value": "100 MVA"},
            {"label": "Tỷ số biến", "value": "230 ± 8×1,25% / 13,8 kV"},
            {"label": "Tổ đấu dây", "value": "YNd11"},
            {"label": "Kiểu làm mát", "value": "ONAN/ONAF"},
        ],
    ),
    dict(
        code="C220-171", name="Máy cắt 220kV ngăn lộ 171", system="Thiết bị nhất thứ 220kV",
        location="Sân phân phối 220 kV", manufacturer="Siemens", model="3AP1 FG",
        commissioned="2013",
        specs=[
            {"label": "Điện áp định mức", "value": "245 kV"},
            {"label": "Dòng định mức", "value": "2500 A"},
            {"label": "Dòng cắt ngắn mạch", "value": "40 kA"},
            {"label": "Môi trường dập hồ quang", "value": "SF6"},
        ],
    ),
    dict(
        code="HT-NKT", name="Hệ thống nước kỹ thuật", system="Hệ thống nước kỹ thuật",
        location="Cao trình 148,0 — Gian phụ trợ",
        specs=[
            {"label": "Số bơm", "value": "3 bơm (2 làm việc, 1 dự phòng)"},
            {"label": "Áp lực làm việc", "value": "0,4 - 0,6 MPa"},
            {"label": "Đối tượng làm mát", "value": "Gối trục, bộ làm mát máy phát, phớt trục"},
        ],
    ),
    dict(
        code="DT-CV", name="Cửa van cung đập tràn", system="Cửa nhận nước - Đập tràn",
        location="Đập tràn — Cao trình 227,0",
        specs=[
            {"label": "Số khoang", "value": "5 khoang"},
            {"label": "Kích thước cửa", "value": "15 × 17 m"},
            {"label": "Kiểu đóng mở", "value": "Xi lanh thuỷ lực"},
            {"label": "MNDBT hồ chứa", "value": "240,0 m"},
            {"label": "Mực nước chết", "value": "215,0 m"},
        ],
    ),
]

PROCEDURES = [
    dict(
        code="QT-VH-01", title="Khởi động tổ máy H1 từ trạng thái dừng dự phòng đến hoà lưới",
        kind="van_hanh", equipment_code="H1-TUA",
        summary="Trình tự khởi động tổ máy H1 từ trạng thái dừng dự phòng, hoà đồng bộ vào lưới "
                "220 kV và mang tải theo lệnh của Điều độ.",
        conditions="Tổ máy ở trạng thái dừng dự phòng, không còn phiếu công tác trên tổ máy, "
                   "các hệ thống phụ trợ sẵn sàng, mực nước thượng lưu trên mực nước chết.",
        safety=[
            "Kiểm tra không có người và vật lạ trong buồng tuabin, hầm ống xả",
            "Xác nhận đã thu hồi toàn bộ phiếu công tác liên quan tới tổ máy H1",
            "Kiểm tra đã tháo hết tiếp địa di động và biển báo an toàn",
            "Thông báo cho Điều độ A1 trước khi khởi động",
        ],
        steps=[
            {"text": "Kiểm tra tín hiệu sẵn sàng khởi động của tổ máy trên màn hình HMI, xác nhận không có tín hiệu cảnh báo tồn tại", "note": ""},
            {"text": "Kiểm tra mức dầu và áp lực bình dầu áp lực điều tốc trong dải 6,0 - 6,3 MPa", "note": "Áp lực dưới 5,8 MPa phải khởi động bơm dầu bổ sung trước"},
            {"text": "Khởi động hệ thống nước kỹ thuật, kiểm tra áp lực nước làm mát 0,4 - 0,6 MPa và lưu lượng qua các gối trục", "note": ""},
            {"text": "Kiểm tra hệ thống khí nén phanh và khí nén máy cắt đủ áp lực làm việc", "note": ""},
            {"text": "Kiểm tra nhiệt độ các gối trục, nhiệt độ cuộn dây stator ở trạng thái nguội, dưới 40°C", "note": ""},
            {"text": "Nhả phanh hãm tổ máy, xác nhận tín hiệu phanh đã nhả hoàn toàn", "note": ""},
            {"text": "Mở van bướm (MIV), theo dõi độ chênh áp hai phía và xác nhận van mở hết hành trình", "note": "Chỉ mở MIV khi độ chênh áp đã cân bằng qua đường by-pass"},
            {"text": "Ra lệnh khởi động, cánh hướng mở tới độ mở không tải, tổ máy tăng tốc", "note": ""},
            {"text": "Theo dõi tốc độ đạt 375 v/ph, kiểm tra độ rung và độ đảo trục trong giới hạn cho phép", "note": "Độ rung gối trục vượt 0,08 mm phải dừng tổ máy kiểm tra"},
            {"text": "Đưa kích từ vào làm việc, tăng điện áp đầu cực tới 13,8 kV, kiểm tra điện áp ba pha cân bằng", "note": ""},
            {"text": "Kiểm tra điều kiện hoà đồng bộ: điện áp, tần số, góc pha nằm trong dải cho phép của thiết bị hoà tự động", "note": ""},
            {"text": "Thực hiện hoà đồng bộ, đóng máy cắt đầu cực và máy cắt 220 kV ngăn lộ tương ứng", "note": ""},
            {"text": "Tăng tải theo lệnh Điều độ, tốc độ tăng tải không quá 10 MW/phút", "note": ""},
            {"text": "Sau khi mang tải ổn định, kiểm tra lại nhiệt độ gối trục, nhiệt độ cuộn dây, độ rung và ghi thông số vào sổ vận hành", "note": ""},
        ],
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương III",
    ),
    dict(
        code="QT-VH-02", title="Dừng tổ máy H1 bình thường theo lệnh Điều độ",
        kind="van_hanh", equipment_code="H1-TUA",
        summary="Trình tự giảm tải, cắt máy cắt và dừng tổ máy H1 về trạng thái dừng dự phòng.",
        conditions="Tổ máy đang vận hành bình thường, có lệnh dừng của Điều độ A1.",
        safety=[
            "Xác nhận lệnh dừng và ghi rõ thời điểm nhận lệnh vào sổ nhật ký vận hành",
            "Theo dõi liên tục tốc độ tổ máy trong quá trình dừng máy",
        ],
        steps=[
            {"text": "Nhận và ghi lệnh dừng của Điều độ, xác nhận lại nội dung lệnh", "note": ""},
            {"text": "Giảm tải tổ máy về 0 MW với tốc độ không quá 10 MW/phút", "note": ""},
            {"text": "Cắt máy cắt đầu cực máy phát khi công suất đã về gần 0", "note": ""},
            {"text": "Cắt kích từ, xác nhận điện áp đầu cực về 0", "note": ""},
            {"text": "Ra lệnh dừng máy, cánh hướng đóng hoàn toàn", "note": ""},
            {"text": "Theo dõi tốc độ giảm, khi tốc độ dưới 30% định mức thì đóng phanh hãm", "note": "Đóng phanh sớm hơn ngưỡng cho phép sẽ làm mòn má phanh"},
            {"text": "Khi tổ máy dừng hẳn, đóng van bướm (MIV)", "note": ""},
            {"text": "Duy trì hệ thống nước làm mát tới khi nhiệt độ gối trục giảm về dưới 40°C rồi mới dừng bơm", "note": ""},
            {"text": "Ghi thời điểm dừng máy, sản lượng và tình trạng thiết bị vào sổ vận hành", "note": ""},
        ],
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương III",
    ),
    dict(
        code="QT-VH-03", title="Thao tác mở cửa van cung đập tràn xả lũ",
        kind="van_hanh", equipment_code="DT-CV",
        summary="Trình tự mở cửa van cung đập tràn để xả lũ theo Quy trình vận hành hồ chứa.",
        conditions="Có lệnh xả lũ của cấp có thẩm quyền, đã thông báo tới chính quyền và nhân dân "
                   "vùng hạ du theo quy định.",
        safety=[
            "Phát tín hiệu còi hú cảnh báo hạ du trước khi mở cửa van tối thiểu 15 phút",
            "Xác nhận không có người và phương tiện trong khu vực lòng dẫn hạ lưu đập tràn",
            "Kiểm tra nguồn điện dự phòng cho hệ thống đóng mở cửa van sẵn sàng",
        ],
        steps=[
            {"text": "Nhận lệnh xả lũ, xác nhận lưu lượng xả và thời điểm bắt đầu xả", "note": ""},
            {"text": "Thông báo tới Ban chỉ huy PCTT địa phương và phát cảnh báo hạ du theo quy định", "note": ""},
            {"text": "Kiểm tra mực nước thượng lưu, lưu lượng về hồ và dự báo lũ", "note": ""},
            {"text": "Kiểm tra hệ thống thuỷ lực đóng mở: mức dầu, áp lực, nguồn cấp điện chính và dự phòng", "note": ""},
            {"text": "Mở cửa van theo thứ tự từ khoang giữa ra hai bên, mỗi lần nâng không quá 0,5 m", "note": "Mở đối xứng để tránh dòng chảy lệch gây xói cục bộ"},
            {"text": "Theo dõi độ mở thực tế trên thước đo và trên HMI, đối chiếu hai giá trị", "note": ""},
            {"text": "Kiểm tra lưu lượng xả thực tế so với lưu lượng yêu cầu, hiệu chỉnh độ mở nếu cần", "note": ""},
            {"text": "Ghi chép độ mở, thời điểm, mực nước hồ và lưu lượng xả vào sổ theo dõi vận hành hồ chứa", "note": ""},
        ],
        source_ref="Quy trình vận hành hồ chứa NMTĐ Hủa Na",
    ),
    dict(
        code="QT-BD-01", title="Bảo dưỡng định kỳ 6 tháng hệ thống kích từ tổ máy",
        kind="bao_duong", equipment_code="H1-EXC",
        summary="Nội dung kiểm tra, vệ sinh và thí nghiệm định kỳ hệ thống kích từ tĩnh UNITROL 6000.",
        conditions="Tổ máy đã dừng, đã cô lập và thực hiện đầy đủ biện pháp an toàn theo phiếu công tác.",
        safety=[
            "Cắt và cô lập nguồn cấp cho tủ kích từ, treo biển 'Cấm đóng điện! Có người đang làm việc'",
            "Phóng điện tích dư trên tụ điện trước khi tiếp xúc mạch lực",
            "Kiểm tra không còn điện áp bằng bút thử điện áp phù hợp cấp điện áp",
            "Đặt tiếp địa di động tại điểm làm việc",
        ],
        steps=[
            {"text": "Kiểm tra ngoại quan tủ kích từ, tình trạng cách điện, dấu vết phóng điện hoặc quá nhiệt", "note": ""},
            {"text": "Vệ sinh bụi bẩn trong tủ bằng khí nén khô, làm sạch cánh tản nhiệt bộ thyristor", "note": "Áp lực khí nén không quá 0,2 MPa để tránh hư hỏng linh kiện"},
            {"text": "Kiểm tra siết chặt các đầu cốt mạch lực, đo nhiệt độ tiếp xúc bằng camera nhiệt sau khi đóng điện", "note": ""},
            {"text": "Kiểm tra tình trạng quạt làm mát tủ, thay thế nếu độ ồn hoặc rung tăng bất thường", "note": ""},
            {"text": "Đo điện trở cách điện mạch kích từ, giá trị tối thiểu 1 MΩ", "note": ""},
            {"text": "Kiểm tra hoạt động của bộ dập từ và mạch bảo vệ quá áp rotor", "note": ""},
            {"text": "Đối chiếu các thông số chỉnh định của bộ điều chỉnh điện áp AVR với hồ sơ chỉnh định", "note": "Mọi thay đổi chỉnh định phải có phê duyệt của cấp có thẩm quyền"},
            {"text": "Thử nghiệm chức năng chuyển kênh điều khiển dự phòng", "note": ""},
            {"text": "Khôi phục sơ đồ, thu hồi tiếp địa, nghiệm thu và ghi biên bản bảo dưỡng", "note": ""},
        ],
        source_ref="Quy trình bảo dưỡng sửa chữa thiết bị NMTĐ Hủa Na",
    ),
    dict(
        code="QT-BD-02", title="Kiểm tra, bảo dưỡng gối trục hướng máy phát",
        kind="bao_duong", equipment_code="H1-GEN",
        summary="Nội dung kiểm tra khe hở, chất lượng dầu và hệ thống làm mát gối trục hướng máy phát.",
        conditions="Tổ máy đã dừng, phanh hãm đã đóng, đã cô lập hệ thống nước làm mát theo phiếu cô lập.",
        safety=[
            "Cô lập và khoá van nước làm mát gối trục, treo biển cảnh báo",
            "Sử dụng dụng cụ chuyên dùng khi tháo nắp gối trục, tránh rơi vật vào bể dầu",
            "Bố trí khay hứng và vật liệu thấm dầu để phòng tràn dầu ra sàn",
        ],
        steps=[
            {"text": "Lấy mẫu dầu gối trục, kiểm tra ngoại quan và gửi thí nghiệm chỉ tiêu lý hoá", "note": ""},
            {"text": "Kiểm tra mức dầu trong bể, bổ sung đúng chủng loại dầu theo hồ sơ thiết bị", "note": "Không trộn lẫn hai chủng loại dầu khác nhau"},
            {"text": "Tháo nắp gối trục, kiểm tra bề mặt babbit các segment, ghi nhận vết xước hoặc bong tróc", "note": ""},
            {"text": "Đo khe hở gối trục bằng căn lá tại các vị trí quy định, đối chiếu với trị số thiết kế", "note": ""},
            {"text": "Kiểm tra tình trạng bộ làm mát dầu, súc rửa nếu hiệu suất trao đổi nhiệt giảm", "note": ""},
            {"text": "Kiểm tra và hiệu chuẩn cảm biến nhiệt độ gối trục (RTD), đối chiếu với nhiệt kế chuẩn", "note": ""},
            {"text": "Lắp lại nắp gối trục, kiểm tra kín khít, khôi phục hệ thống nước làm mát", "note": ""},
            {"text": "Chạy thử không tải, theo dõi nhiệt độ và độ rung gối trục trong 2 giờ đầu", "note": ""},
        ],
        source_ref="Quy trình bảo dưỡng sửa chữa thiết bị NMTĐ Hủa Na",
    ),
    dict(
        code="QT-BD-03", title="Bảo dưỡng hệ thống dầu áp lực điều tốc",
        kind="bao_duong", equipment_code="H1-GOV",
        summary="Kiểm tra bình dầu áp lực, bơm dầu, van an toàn và chất lượng dầu hệ thống điều tốc.",
        conditions="Tổ máy đã dừng, van bướm đã đóng, đã xả áp hệ thống theo trình tự.",
        safety=[
            "Xả hết áp lực trong bình dầu và xác nhận đồng hồ áp lực chỉ 0 trước khi tháo mặt bích",
            "Cấm hàn, cắt, sinh lửa trong khu vực có dầu áp lực",
            "Chuẩn bị sẵn phương tiện chữa cháy phù hợp tại khu vực làm việc",
        ],
        steps=[
            {"text": "Lấy mẫu dầu áp lực, kiểm tra độ nhớt, hàm lượng nước và độ nhiễm bẩn hạt", "note": ""},
            {"text": "Kiểm tra và thay thế lõi lọc dầu theo định kỳ hoặc khi chênh áp qua lọc vượt ngưỡng", "note": ""},
            {"text": "Kiểm tra hoạt động của bơm dầu chính và bơm dầu dự phòng, đo dòng điện động cơ", "note": ""},
            {"text": "Thử nghiệm van an toàn bình dầu áp lực ở áp suất chỉnh định", "note": ""},
            {"text": "Kiểm tra tỷ lệ dầu - khí trong bình tích năng, bổ sung khí nén nếu thiếu", "note": "Tỷ lệ sai lệch làm giảm số lần thao tác dự trữ khi mất điện"},
            {"text": "Kiểm tra rò rỉ tại các mối nối, van và xi lanh servo cánh hướng", "note": ""},
            {"text": "Đo thời gian đóng cánh hướng, đối chiếu trị số 8 - 10 giây", "note": ""},
            {"text": "Nghiệm thu, ghi biên bản và cập nhật lý lịch thiết bị", "note": ""},
        ],
        source_ref="Quy trình bảo dưỡng sửa chữa thiết bị NMTĐ Hủa Na",
    ),
]

INCIDENTS = [
    dict(
        code="SC-01", title="Nhiệt độ gối trục hướng máy phát tăng cao",
        equipment_code="H1-GEN", severity="nghiem_trong", source="quy_trinh",
        symptoms=[
            "Tín hiệu cảnh báo nhiệt độ gối trục hướng máy phát vượt 65°C trên HMI",
            "Nhiệt độ tiếp tục tăng dù công suất tổ máy không đổi",
            "Có thể kèm theo tăng độ rung gối trục",
            "Nhiệt độ dầu bể gối trục tăng theo",
        ],
        causes=[
            "Lưu lượng hoặc áp lực nước làm mát giảm do tắc lọc, hỏng bơm",
            "Mức dầu bôi trơn trong bể gối trục thấp hơn quy định",
            "Chất lượng dầu suy giảm, lẫn nước hoặc tạp chất",
            "Khe hở gối trục sai lệch, bề mặt babbit hư hỏng",
            "Cảm biến nhiệt độ (RTD) sai lệch hoặc hỏng",
        ],
        actions=[
            "Kiểm tra ngay chỉ số của các cảm biến nhiệt độ khác trên cùng gối trục để loại trừ khả năng hỏng cảm biến",
            "Kiểm tra áp lực và lưu lượng nước làm mát gối trục, so sánh với trị số định mức 0,4 - 0,6 MPa",
            "Nếu áp lực thấp: chuyển sang bơm nước kỹ thuật dự phòng và kiểm tra lọc nước",
            "Kiểm tra mức dầu trong bể gối trục, bổ sung nếu thiếu",
            "Kiểm tra độ rung gối trục, ghi nhận xu hướng biến đổi",
            "Báo cáo Trưởng ca và Điều độ về tình trạng thiết bị",
            "Nếu nhiệt độ đạt ngưỡng bảo vệ (thường 70°C): giảm tải tổ máy theo lệnh Trưởng ca",
            "Nếu nhiệt độ tiếp tục tăng đến ngưỡng dừng máy: dừng tổ máy theo quy trình dừng sự cố",
            "Sau khi dừng máy, duy trì bơm dầu và nước làm mát tới khi nhiệt độ về dưới 40°C",
            "Lập biên bản, báo cáo và chuyển tổ sửa chữa kiểm tra khe hở, chất lượng dầu và bề mặt gối trục",
        ],
        prevention="Kiểm tra chất lượng dầu và súc rửa lọc nước làm mát theo đúng chu kỳ bảo dưỡng. "
                   "Theo dõi xu hướng nhiệt độ gối trục hằng ca, phát hiện sớm khi độ dốc tăng bất thường "
                   "dù giá trị tuyệt đối vẫn trong giới hạn.",
        lesson="Nhiệt độ tăng chậm và đều trong nhiều ca thường là dấu hiệu suy giảm hệ thống làm mát; "
               "nhiệt độ tăng đột ngột trong vài phút thường là sự cố cơ khí hoặc mất nước làm mát.",
        tags="gối trục, nhiệt độ, làm mát, máy phát",
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương V",
    ),
    dict(
        code="SC-02", title="Máy cắt đầu cực nhảy do bảo vệ so lệch máy phát tác động",
        equipment_code="H1-GEN", severity="nghiem_trong", source="quy_trinh",
        symptoms=[
            "Máy cắt đầu cực máy phát nhảy đột ngột, tổ máy tách khỏi lưới",
            "Rơ le bảo vệ so lệch máy phát (87G) báo tác động",
            "Kích từ tự động cắt, tổ máy dừng theo trình tự dừng sự cố",
            "Có thể kèm tiếng nổ, mùi khét hoặc khói tại khu vực máy phát",
        ],
        causes=[
            "Ngắn mạch trong vùng bảo vệ: cuộn dây stator, thanh dẫn đầu cực",
            "Hỏng cách điện cuộn dây stator do già hoá hoặc nhiễm ẩm",
            "Sai lệch tỷ số hoặc hỏng biến dòng ở một đầu vùng bảo vệ",
            "Đấu nhầm cực tính mạch dòng sau công tác thí nghiệm",
        ],
        actions=[
            "Xác nhận tổ máy đã dừng an toàn, phanh hãm đã đóng, van bướm đã đóng",
            "Ghi lại toàn bộ tín hiệu rơ le tác động và bản ghi sự cố trên hệ thống bảo vệ",
            "Báo cáo ngay Trưởng ca, Lãnh đạo nhà máy và Điều độ A1",
            "Kiểm tra ngoại quan khu vực máy phát: dấu vết phóng điện, khói, mùi khét, biến dạng thanh dẫn",
            "TUYỆT ĐỐI KHÔNG khởi động lại tổ máy khi chưa xác định được nguyên nhân",
            "Cô lập tổ máy, thực hiện biện pháp an toàn theo phiếu công tác",
            "Phối hợp với bộ phận thí nghiệm đo điện trở cách điện, hệ số hấp thụ cuộn dây stator",
            "Kiểm tra mạch dòng và cực tính biến dòng hai đầu vùng bảo vệ so lệch",
            "Chỉ đưa tổ máy trở lại vận hành sau khi có kết luận nguyên nhân và biên bản nghiệm thu",
        ],
        prevention="Thực hiện thí nghiệm định kỳ cách điện cuộn dây stator. Sau mỗi công tác trên mạch "
                   "nhị thứ bảo vệ so lệch phải thử nghiệm lại dòng vòng và kiểm tra cực tính trước khi "
                   "đưa bảo vệ vào làm việc.",
        lesson="Bảo vệ so lệch tác động là sự cố nghiêm trọng trong vùng bảo vệ. Việc khởi động lại "
               "để 'thử xem sao' có thể biến hư hỏng cục bộ thành cháy hỏng toàn bộ cuộn dây stator.",
        tags="bảo vệ so lệch, 87G, máy cắt, sự cố điện",
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương V",
    ),
    dict(
        code="SC-03", title="Mất điện tự dùng xoay chiều 0,4 kV",
        equipment_code="", severity="nghiem_trong", source="quy_trinh",
        symptoms=[
            "Mất điện chiếu sáng làm việc, chỉ còn chiếu sáng sự cố",
            "Các bơm nước kỹ thuật, bơm dầu, quạt làm mát ngừng hoạt động",
            "Hệ thống điều khiển chuyển sang nguồn ắc quy một chiều",
            "Cảnh báo mất nguồn trên tủ phân phối tự dùng",
        ],
        causes=[
            "Sự cố máy biến áp tự dùng hoặc tuyến cáp cấp nguồn",
            "Bảo vệ tuyến tự dùng tác động do ngắn mạch phía hạ áp",
            "Hỏng thiết bị chuyển nguồn tự động ATS",
            "Mất nguồn dự phòng từ lưới khu vực đồng thời với nguồn tự dùng chính",
        ],
        actions=[
            "Xác nhận trạng thái các tổ máy đang vận hành và báo cáo Điều độ",
            "Kiểm tra hệ thống một chiều và bộ nạp ắc quy, xác nhận nguồn điều khiển còn duy trì",
            "Kiểm tra ATS đã chuyển sang nguồn dự phòng chưa, nếu chưa thì chuyển bằng tay",
            "Nếu không khôi phục được nguồn: khởi động máy phát diesel dự phòng",
            "Ưu tiên khôi phục nguồn cho bơm dầu bôi trơn, bơm nước làm mát và hệ thống điều khiển",
            "Theo dõi sát nhiệt độ gối trục các tổ máy đang vận hành do mất nước làm mát",
            "Nếu không khôi phục được nước làm mát trong thời gian cho phép: dừng tổ máy theo quy trình",
            "Kiểm tra tìm điểm sự cố trên tuyến tự dùng, cô lập phần hư hỏng và khôi phục dần phụ tải",
        ],
        prevention="Thử nghiệm định kỳ khả năng tự khởi động của máy phát diesel và chức năng chuyển "
                   "nguồn ATS. Kiểm tra dung lượng ắc quy theo chu kỳ quy định.",
        tags="tự dùng, 0.4kV, ATS, diesel",
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương V",
    ),
    dict(
        code="SC-04", title="Rò rỉ dầu gối trục tuabin ra sàn gian máy",
        equipment_code="H1-TUA", severity="trung_binh", source="kinh_nghiem",
        symptoms=[
            "Xuất hiện vết dầu loang trên sàn khu vực gối trục tuabin",
            "Mức dầu trong bể gối trục giảm dần qua các ca trực",
            "Có thể phát hiện mùi dầu nóng trong gian máy",
        ],
        causes=[
            "Lão hoá gioăng làm kín nắp bể dầu",
            "Nới lỏng bu lông mặt bích do rung động lâu ngày",
            "Áp suất trong bể dầu tăng do tắc đường thông hơi",
            "Nứt đường ống dẫn dầu bôi trơn",
        ],
        actions=[
            "Khoanh vùng, đặt khay hứng và vật liệu thấm dầu, tránh dầu chảy xuống hầm ống xả",
            "Xác định chính xác vị trí rò rỉ bằng cách lau sạch và theo dõi",
            "Ghi nhận tốc độ giảm mức dầu để đánh giá mức độ nghiêm trọng",
            "Bổ sung dầu đúng chủng loại, duy trì mức dầu trong giới hạn vận hành",
            "Kiểm tra đường thông hơi bể dầu có bị tắc không",
            "Báo cáo Trưởng ca, lập phiếu yêu cầu sửa chữa",
            "Nếu tốc độ rò rỉ lớn không giữ được mức dầu: đề nghị dừng tổ máy để xử lý",
        ],
        prevention="Kiểm tra siết chặt bu lông mặt bích sau mỗi kỳ đại tu. Vệ sinh đường thông hơi bể "
                   "dầu theo chu kỳ bảo dưỡng.",
        lesson="Tại Hủa Na, phần lớn các trường hợp rò rỉ dầu gối trục xuất phát từ đường thông hơi bị "
               "tắc làm tăng áp suất trong bể chứ không phải do hỏng gioăng. Nên kiểm tra thông hơi "
               "trước khi quyết định thay gioăng.",
        tags="rò rỉ dầu, gối trục, tuabin",
    ),
    dict(
        code="SC-05", title="Sa thải phụ tải đột ngột, tổ máy tăng tốc vượt định mức",
        equipment_code="H1-TUA", severity="nghiem_trong", source="quy_trinh",
        symptoms=[
            "Máy cắt đầu cực hoặc máy cắt 220 kV cắt đột ngột khi tổ máy đang mang tải",
            "Tốc độ tổ máy tăng nhanh vượt 375 v/ph",
            "Tần số máy phát tăng, điện áp đầu cực tăng",
            "Có thể nghe tiếng gầm tăng dần từ buồng tuabin",
        ],
        causes=[
            "Sự cố trên lưới truyền tải làm tách tổ máy khỏi hệ thống",
            "Bảo vệ tổ máy hoặc bảo vệ đường dây tác động",
            "Thao tác nhầm gây cắt máy cắt",
        ],
        actions=[
            "Theo dõi hoạt động của bộ điều tốc: cánh hướng phải đóng nhanh để hạn chế tăng tốc",
            "Xác nhận tốc độ đạt đỉnh rồi giảm dần, không vượt tốc độ lồng tốc 700 v/ph",
            "Nếu điều tốc không tác động: thao tác đóng cánh hướng bằng tay tại chỗ",
            "Nếu tốc độ tiếp tục tăng nguy hiểm: đóng van bướm (MIV) khẩn cấp",
            "Kiểm tra kích từ đã cắt và điện áp đầu cực đã giảm",
            "Sau khi tổ máy dừng, kiểm tra độ rung, nhiệt độ gối trục và tình trạng cánh hướng",
            "Báo cáo Điều độ, xác định nguyên nhân tách lưới trước khi hoà lại",
            "Kiểm tra áp lực bình dầu điều tốc đã hồi phục trước khi khởi động lại",
        ],
        prevention="Thử nghiệm định kỳ thời gian đóng cánh hướng và chức năng bảo vệ vượt tốc. "
                   "Duy trì áp lực dầu điều tốc trong dải quy định để đảm bảo đủ năng lượng đóng "
                   "cánh hướng khi mất điện.",
        tags="sa thải phụ tải, vượt tốc, điều tốc",
        source_ref="Quy trình vận hành và xử lý sự cố NMTĐ Hủa Na — Chương V",
    ),
    dict(
        code="SC-06", title="Kẹt cửa van cung đập tràn do vật trôi mắc kẹt",
        equipment_code="DT-CV", severity="trung_binh", source="kinh_nghiem",
        symptoms=[
            "Cửa van không đạt được độ mở đặt, độ mở thực tế lệch so với lệnh",
            "Áp lực dầu xi lanh thuỷ lực tăng cao bất thường",
            "Quan sát thấy cây, rác lớn mắc tại ngưỡng tràn hoặc khe van",
        ],
        causes=[
            "Cây gỗ, rác lớn trôi về theo lũ mắc vào khe van hoặc ngưỡng tràn",
            "Bồi lắng bùn cát tại ngưỡng cửa van sau thời gian dài không vận hành",
            "Hỏng cơ cấu dẫn hướng hoặc bánh xe cữ",
        ],
        actions=[
            "Dừng thao tác nâng cửa van, tránh làm cong vênh kết cấu",
            "Ghi nhận độ mở thực tế và áp lực thuỷ lực tại thời điểm kẹt",
            "Thử hạ cửa van một khoảng nhỏ rồi nâng lại để đẩy vật trôi thoát ra",
            "Nếu không hiệu quả: chuyển sang mở các khoang cửa van khác để đảm bảo lưu lượng xả",
            "Báo cáo Trưởng ca và Lãnh đạo nhà máy, huy động lực lượng vớt rác",
            "Sau khi hết lũ, kiểm tra chi tiết khe van, bánh xe cữ và kết cấu cửa",
        ],
        prevention="Tăng cường vớt rác trước và trong mùa lũ. Vận hành thử các cửa van trước mùa lũ "
                   "hằng năm để phát hiện sớm bồi lắng và kẹt cơ khí.",
        lesson="Việc nâng cưỡng bức khi cửa van bị kẹt đã từng làm cong thanh dẫn hướng ở một số công "
               "trình. Thao tác hạ xuống rồi nâng lại thường giải phóng được vật trôi mà không gây hư hỏng.",
        tags="cửa van, đập tràn, xả lũ, vật trôi",
    ),
    dict(
        code="SC-07", title="Sai lệch tín hiệu vị trí cánh hướng do hỏng bộ mã hoá",
        equipment_code="H1-GOV", severity="trung_binh", source="nha_may_khac",
        symptoms=[
            "Độ mở cánh hướng hiển thị trên HMI không khớp với vị trí thực tế đọc tại chỗ",
            "Công suất phát không tương ứng với độ mở cánh hướng hiển thị",
            "Bộ điều tốc dao động, công suất tổ máy không ổn định",
        ],
        causes=[
            "Hỏng bộ mã hoá vị trí (encoder) hoặc biến trở phản hồi",
            "Đứt, chập cáp tín hiệu phản hồi vị trí",
            "Lỏng khớp nối cơ khí giữa trục phản hồi và vành điều chỉnh",
            "Nhiễu điện từ trên đường cáp tín hiệu",
        ],
        actions=[
            "Đối chiếu độ mở hiển thị với thước đo cơ khí tại chỗ để xác nhận sai lệch",
            "Chuyển bộ điều tốc sang chế độ điều khiển bằng tay, giữ công suất ổn định",
            "Báo cáo Trưởng ca và Điều độ về hạn chế điều khiển của tổ máy",
            "Kiểm tra khớp nối cơ khí của cơ cấu phản hồi vị trí",
            "Đo kiểm tra tín hiệu phản hồi và tình trạng cáp tín hiệu",
            "Nếu không xử lý được tại chỗ: đề nghị dừng tổ máy để thay thế bộ mã hoá",
        ],
        prevention="Kiểm tra và hiệu chuẩn tín hiệu phản hồi vị trí cánh hướng trong mỗi kỳ bảo dưỡng "
                   "định kỳ, đối chiếu với thước đo cơ khí.",
        lesson="Bài học từ nhà máy bạn: vận hành kéo dài với tín hiệu phản hồi sai lệch khiến bộ điều "
               "tốc liên tục điều chỉnh, gây mài mòn nhanh cơ cấu servo cánh hướng. Cần chuyển sang "
               "điều khiển bằng tay ngay khi phát hiện sai lệch.",
        tags="điều tốc, cánh hướng, encoder, phản hồi vị trí",
    ),
]

FORMS = [
    dict(
        code="PCL-01", title="Thao tác đưa tổ máy H1 ra sửa chữa",
        form_type="co_lap", context="bao_duong", work_type="Đưa thiết bị ra sửa chữa",
        equipment_code="H1-TUA",
        purpose="Tách tổ máy H1 khỏi lưới và đưa về trạng thái sửa chữa để thực hiện công tác bảo dưỡng.",
        conditions="Có lệnh của Điều độ A1 và kế hoạch sửa chữa đã được phê duyệt.",
        safety=[
            "Kiểm tra không còn điện áp bằng thiết bị thử phù hợp cấp điện áp",
            "Đặt tiếp địa di động tại các điểm quy định",
            "Treo biển 'Cấm đóng điện! Có người đang làm việc' tại các điểm thao tác",
            "Rào chắn khu vực làm việc và treo biển chỉ dẫn",
        ],
        rows=[
            {"target": "Tổ máy H1", "action": "Giảm tải về 0 MW theo lệnh Điều độ", "note": "Không quá 10 MW/phút"},
            {"target": "Máy cắt đầu cực H1", "action": "Cắt máy cắt đầu cực máy phát", "note": ""},
            {"target": "Hệ thống kích từ H1", "action": "Cắt kích từ, xác nhận điện áp đầu cực về 0", "note": ""},
            {"target": "Tổ máy H1", "action": "Ra lệnh dừng máy, cánh hướng đóng hoàn toàn", "note": ""},
            {"target": "Phanh hãm H1", "action": "Đóng phanh hãm khi tốc độ dưới 30% định mức", "note": ""},
            {"target": "Van bướm MIV H1", "action": "Đóng van bướm, xác nhận đóng hết hành trình", "note": ""},
            {"target": "Máy cắt 220kV ngăn lộ 171", "action": "Cắt máy cắt 220 kV", "note": ""},
            {"target": "Dao cách ly 171-1, 171-2", "action": "Cắt dao cách ly hai phía máy cắt", "note": "Kiểm tra vị trí cắt tại chỗ"},
            {"target": "Ngăn lộ 171", "action": "Kiểm tra không còn điện áp", "note": "Dùng thiết bị thử điện áp 220 kV"},
            {"target": "Ngăn lộ 171", "action": "Đóng dao tiếp địa 171-15", "note": ""},
            {"target": "Đầu cực máy phát H1", "action": "Đặt tiếp địa di động tại đầu cực máy phát", "note": ""},
            {"target": "Khu vực công tác", "action": "Treo biển báo an toàn, rào chắn và bàn giao hiện trường", "note": ""},
        ],
    ),
    dict(
        code="PTL-01", title="Thao tác đưa tổ máy H1 vào vận hành sau sửa chữa",
        form_type="tai_lap", context="bao_duong", work_type="Đưa thiết bị vào vận hành",
        equipment_code="H1-TUA",
        purpose="Khôi phục sơ đồ và đưa tổ máy H1 trở lại vận hành sau khi hoàn thành công tác sửa chữa.",
        conditions="Đã nghiệm thu công tác sửa chữa, đã thu hồi toàn bộ phiếu công tác.",
        safety=[
            "Xác nhận đã thu hồi toàn bộ phiếu công tác và người ra khỏi khu vực thiết bị",
            "Kiểm tra và thu hồi hết tiếp địa di động, đếm đủ số lượng đã đặt",
            "Kiểm tra không còn dụng cụ, vật tư trong buồng tuabin và hầm ống xả",
        ],
        rows=[
            {"target": "Khu vực công tác", "action": "Thu hồi phiếu công tác, kiểm tra người đã ra hết", "note": ""},
            {"target": "Đầu cực máy phát H1", "action": "Tháo và thu hồi tiếp địa di động", "note": "Đếm đủ số lượng đã đặt"},
            {"target": "Ngăn lộ 171", "action": "Cắt dao tiếp địa 171-15", "note": ""},
            {"target": "Khu vực thiết bị", "action": "Tháo biển báo, rào chắn an toàn", "note": ""},
            {"target": "Dao cách ly 171-1, 171-2", "action": "Đóng dao cách ly hai phía máy cắt", "note": ""},
            {"target": "Hệ thống phụ trợ", "action": "Khởi động hệ thống nước kỹ thuật, kiểm tra áp lực dầu điều tốc", "note": ""},
            {"target": "Van bướm MIV H1", "action": "Mở van bướm sau khi cân bằng áp lực qua by-pass", "note": ""},
            {"target": "Tổ máy H1", "action": "Nhả phanh hãm, khởi động tổ máy tới tốc độ định mức", "note": ""},
            {"target": "Hệ thống kích từ H1", "action": "Đưa kích từ vào, tăng điện áp tới 13,8 kV", "note": ""},
            {"target": "Máy cắt 220kV / đầu cực", "action": "Hoà đồng bộ, đóng máy cắt và mang tải theo lệnh Điều độ", "note": ""},
        ],
    ),
    dict(
        code="PCL-02", title="Cô lập hệ thống nước làm mát tổ máy H1",
        form_type="co_lap", context="bao_duong", work_type="Đưa thiết bị ra sửa chữa",
        equipment_code="HT-NKT",
        purpose="Cô lập tuyến nước làm mát tổ máy H1 để vệ sinh bộ làm mát và thay thế lọc.",
        conditions="Tổ máy H1 đã dừng và nhiệt độ các gối trục đã giảm dưới 40°C.",
        safety=[
            "Xác nhận tổ máy đã dừng hẳn và không có kế hoạch khởi động trong thời gian công tác",
            "Treo biển 'Cấm thao tác! Có người đang làm việc' tại các van đã khoá",
            "Chuẩn bị phương tiện hứng nước khi xả đường ống",
        ],
        rows=[
            {"target": "Van cấp nước làm mát tổng V-NKT-01", "action": "Đóng và khoá van bằng khoá cơ khí", "note": "Treo biển cảnh báo"},
            {"target": "Van cấp nước gối trục tuabin", "action": "Đóng van, xác nhận vị trí đóng", "note": ""},
            {"target": "Van cấp nước gối trục máy phát", "action": "Đóng van, xác nhận vị trí đóng", "note": ""},
            {"target": "Van cấp nước bộ làm mát máy phát", "action": "Đóng van, xác nhận vị trí đóng", "note": ""},
            {"target": "Van hồi nước làm mát", "action": "Đóng van hồi", "note": ""},
            {"target": "Bơm nước kỹ thuật số 1, 2", "action": "Cắt aptomat nguồn động lực, khoá tủ điều khiển", "note": "Chuyển chế độ về MANUAL"},
            {"target": "Đường ống công tác", "action": "Mở van xả để giảm áp và tháo cạn nước", "note": "Chuẩn bị phương tiện hứng"},
            {"target": "Đồng hồ áp lực đường ống", "action": "Kiểm tra xác nhận áp lực chỉ 0 MPa", "note": "Bắt buộc trước khi tháo mặt bích"},
        ],
        notes="Chỉ bàn giao hiện trường sau khi đã kiểm tra xác nhận không còn áp lực dư trong đường ống.",
    ),
    dict(
        code="PCL-03", title="Cô lập máy biến áp chính T1 để thí nghiệm định kỳ",
        form_type="co_lap", context="bao_duong", work_type="Thí nghiệm định kỳ",
        equipment_code="AT1",
        purpose="Cô lập máy biến áp chính T1 khỏi lưới 220 kV và phía 13,8 kV để thực hiện thí nghiệm định kỳ.",
        conditions="Có phương thức đã được Điều độ A1 duyệt, tổ máy H1 đã dừng.",
        safety=[
            "Kiểm tra không còn điện áp cả phía 220 kV và phía 13,8 kV",
            "Đặt tiếp địa di động cả hai phía máy biến áp",
            "Treo biển 'Cấm đóng điện! Có người đang làm việc' tại mọi điểm thao tác",
            "Cảnh giới khu vực sân phân phối 220 kV, xác định ranh giới an toàn với các ngăn lộ mang điện",
        ],
        rows=[
            {"target": "Máy cắt 220kV 171", "action": "Cắt máy cắt", "note": "Xác nhận chỉ thị vị trí cắt"},
            {"target": "Máy cắt đầu cực H1", "action": "Cắt máy cắt đầu cực", "note": ""},
            {"target": "Dao cách ly 171-1", "action": "Cắt dao cách ly phía thanh cái", "note": "Kiểm tra vị trí tại chỗ"},
            {"target": "Dao cách ly 171-7", "action": "Cắt dao cách ly phía máy biến áp", "note": ""},
            {"target": "Mạch điều khiển máy cắt 171", "action": "Cắt aptomat mạch điều khiển và mạch động lực", "note": "Ngăn thao tác nhầm"},
            {"target": "Phía 220 kV máy biến áp T1", "action": "Kiểm tra không còn điện áp bằng thiết bị thử 220 kV", "note": ""},
            {"target": "Phía 220 kV máy biến áp T1", "action": "Đóng dao tiếp địa 171-75", "note": ""},
            {"target": "Phía 13,8 kV máy biến áp T1", "action": "Kiểm tra không còn điện áp và đặt tiếp địa di động", "note": ""},
            {"target": "Mạch tự dùng máy biến áp T1", "action": "Cắt nguồn quạt làm mát và bộ điều áp dưới tải", "note": ""},
            {"target": "Khu vực máy biến áp T1", "action": "Rào chắn, treo biển và bàn giao hiện trường cho đơn vị thí nghiệm", "note": ""},
        ],
    ),
    dict(
        code="PCL-04", title="Tách tổ máy H2 khỏi lưới theo lệnh Điều độ",
        form_type="co_lap", context="van_hanh", work_type="Chuyển phương thức vận hành",
        equipment_code="H2-GEN",
        purpose="Dừng tổ máy H2 và tách khỏi lưới theo biểu đồ huy động, giữ tổ máy ở trạng thái dừng dự phòng.",
        conditions="Có lệnh của Điều độ A1. Không có công tác trên thiết bị, tổ máy còn nguyên sơ đồ.",
        safety=[
            "Xác nhận rõ nội dung lệnh và thời điểm thực hiện với Điều độ trước khi thao tác",
            "Theo dõi mực nước hồ và lưu lượng xả để bảo đảm dòng chảy tối thiểu hạ du",
            "Không cắt dao cách ly, không đặt tiếp địa — tổ máy giữ trạng thái sẵn sàng khởi động lại",
        ],
        rows=[
            {"target": "Tổ máy H2", "action": "Giảm tải về công suất tối thiểu theo lệnh Điều độ", "note": "Không quá 10 MW/phút"},
            {"target": "Tổ máy H2", "action": "Tiếp tục giảm tải về 0 MW, theo dõi độ rung và độ mở cánh hướng", "note": "Qua nhanh vùng vận hành không ổn định"},
            {"target": "Máy cắt đầu cực H2", "action": "Cắt máy cắt đầu cực máy phát", "note": "Xác nhận chỉ thị vị trí cắt"},
            {"target": "Hệ thống kích từ H2", "action": "Cắt kích từ, xác nhận điện áp đầu cực về 0", "note": ""},
            {"target": "Tổ máy H2", "action": "Ra lệnh dừng máy, cánh hướng đóng hoàn toàn", "note": ""},
            {"target": "Phanh hãm H2", "action": "Đóng phanh hãm khi tốc độ dưới 30% định mức", "note": ""},
            {"target": "Hệ thống dầu bôi trơn H2", "action": "Chuyển bơm dầu về chế độ tự động, kiểm tra nhiệt độ gối trục", "note": ""},
            {"target": "Tổ máy H2", "action": "Xác nhận trạng thái dừng dự phòng, báo cáo Điều độ", "note": "Ghi nhật ký vận hành"},
        ],
        notes="Tổ máy giữ nguyên sơ đồ nối lưới để sẵn sàng khởi động lại khi có lệnh huy động.",
    ),
    dict(
        code="PTL-02", title="Hoà tổ máy H2 vào lưới theo lệnh Điều độ",
        form_type="tai_lap", context="van_hanh", work_type="Chuyển phương thức vận hành",
        equipment_code="H2-GEN",
        purpose="Khởi động tổ máy H2 từ trạng thái dừng dự phòng và hoà vào lưới theo biểu đồ huy động.",
        conditions="Có lệnh của Điều độ A1. Tổ máy ở trạng thái dừng dự phòng, không có phiếu công tác trên thiết bị.",
        safety=[
            "Kiểm tra không có người và vật tư trong buồng tuabin, hầm ống xả trước khi khởi động",
            "Xác nhận không tồn tại phiếu công tác chưa thu hồi trên tổ máy H2",
            "Theo dõi độ rung khi qua vùng tốc độ cộng hưởng, sẵn sàng dừng sự cố",
        ],
        rows=[
            {"target": "Tổ máy H2", "action": "Kiểm tra điều kiện khởi động: mức dầu, áp lực dầu điều tốc, nhiệt độ gối trục", "note": ""},
            {"target": "Hệ thống nước kỹ thuật", "action": "Khởi động bơm nước làm mát, xác nhận lưu lượng và áp lực đạt định mức", "note": ""},
            {"target": "Van bướm MIV H2", "action": "Cân bằng áp lực qua by-pass rồi mở van bướm hết hành trình", "note": ""},
            {"target": "Phanh hãm H2", "action": "Nhả phanh hãm, xác nhận áp lực khí phanh về 0", "note": ""},
            {"target": "Tổ máy H2", "action": "Mở cánh hướng khởi động, tăng tốc tới tốc độ định mức 375 v/ph", "note": "Theo dõi độ rung khi qua vùng cộng hưởng"},
            {"target": "Hệ thống kích từ H2", "action": "Đưa kích từ vào, tăng điện áp đầu cực tới 13,8 kV", "note": ""},
            {"target": "Thiết bị hoà đồng bộ", "action": "Kiểm tra điều kiện hoà: điện áp, tần số, góc pha", "note": "Hoà tự động, giám sát bằng đồng bộ kế"},
            {"target": "Máy cắt đầu cực H2", "action": "Đóng máy cắt hoà tổ máy vào lưới", "note": ""},
            {"target": "Tổ máy H2", "action": "Tăng tải tới công suất Điều độ giao, báo cáo hoàn thành", "note": "Ghi nhật ký vận hành"},
        ],
    ),
]


def seed(force: bool = False) -> None:
    init_db()
    existing = query_one("SELECT COUNT(*) AS n FROM equipment")
    if existing and existing["n"] and not force:
        print("Cơ sở dữ liệu đã có dữ liệu. Dùng --force để nạp thêm dữ liệu mẫu.")
        return

    codes: dict[str, int] = {}
    for item in EQUIPMENT:
        try:
            created = create_equipment(EquipmentIn(**item))
            codes[created["code"]] = created["id"]
            print(f"  + Thiết bị {created['code']}: {created['name']}")
        except Exception as exc:
            print(f"  ! Bỏ qua thiết bị {item['code']}: {exc}")

    for item in PROCEDURES:
        payload = dict(item)
        equipment_code = payload.pop("equipment_code", "")
        payload["equipment_id"] = codes.get(equipment_code)
        created = procedures_router.create_procedure(ProcedureIn(**payload))
        print(f"  + Quy trình {created['code']}: {created['title']}")

    for item in INCIDENTS:
        payload = dict(item)
        equipment_code = payload.pop("equipment_code", "")
        payload["equipment_id"] = codes.get(equipment_code)
        created = incidents_router.create_incident(IncidentIn(**payload))
        print(f"  + Hồ sơ sự cố {created['code']}: {created['title']}")

    for item in FORMS:
        payload = dict(item)
        equipment_code = payload.pop("equipment_code", "")
        payload["equipment_id"] = codes.get(equipment_code)
        created = forms_router.create_form(FormIn(**payload))
        print(f"  + Biểu mẫu {created['code']}: {created['title']}")

    index.rebuild()
    print(f"\nĐã nạp xong. Chỉ mục tra cứu: {index.size} đoạn.")


if __name__ == "__main__":
    seed(force="--force" in sys.argv)
