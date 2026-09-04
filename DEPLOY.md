# Triển khai CSWIND Welder Control App lên Render.com

Ứng dụng này là một app Node.js/Express + PostgreSQL độc lập, hoàn toàn tách khỏi Claude —
một khi đã deploy, nó tự vận hành, không cần Claude nữa. Tài liệu này hướng dẫn từng bước để
đưa app lên Render.com rồi nhúng vào trang SharePoint của CSWIND.

## Điều bạn cần chuẩn bị trước

- Một tài khoản Render.com (miễn phí để tạo, gói trả phí nếu muốn tránh app "ngủ" khi không
  có người dùng — xem phần "Chọn gói" bên dưới).
- Toàn bộ thư mục `cswind-app` (chứa code này) — cần đưa lên GitHub (hoặc GitLab/Bitbucket)
  vì Render deploy trực tiếp từ một Git repository.
- Quyền chỉnh sửa trang SharePoint:
  https://cswind.sharepoint.com/sites/GBCProductionDivision/SitePages/Welder-Control-tool.aspx

## Bước 1 — Đưa code lên GitHub (không cần dùng dòng lệnh)

1. Vào https://github.com và tạo tài khoản nếu chưa có.
2. Bấm nút **+** ở góc trên bên phải → **New repository**.
3. Đặt tên (ví dụ `cswind-welder-app`), chọn **Private** (bắt buộc — repo này chứa dữ liệu
   thật của 260 thợ hàn), rồi bấm **Create repository**.
4. Trên trang repo vừa tạo, bấm **uploading an existing file** (hoặc **Add file** → **Upload
   files**).
5. Mở thư mục `cswind-app` đã giải nén trên máy bạn, chọn **toàn bộ file và thư mục con** bên
   trong (`public`, `src`, `seed_data`, `package.json`, `.gitignore`, `DEPLOY.md` — **không**
   chọn thư mục `node_modules` nếu có, không cần thư mục đó) rồi **kéo thả** vào ô upload của
   GitHub. Trình duyệt Chrome/Edge giữ nguyên cấu trúc thư mục con khi kéo thả.
6. Cuộn xuống, bấm **Commit changes**.

Vậy là xong — không cần cài Git, không cần dòng lệnh.

## Bước 2 — Tạo PostgreSQL database trên Render

1. Vào Render Dashboard → **New** → **PostgreSQL**.
2. Đặt tên (ví dụ `cswind-db`), chọn vùng (Region) gần Việt Nam nhất có sẵn (thường là
   Singapore nếu có).
3. Chọn gói (Free hoặc trả phí — xem ghi chú bên dưới).
4. Tạo xong, Render sẽ cho bạn một **Internal Database URL** — bạn sẽ dùng giá trị này ở bước
   sau (không cần copy tay, Render tự nối khi bạn link database vào Web Service).

## Bước 3 — Tạo Web Service

1. Render Dashboard → **New** → **Web Service**.
2. Chọn repository GitHub bạn vừa tạo ở Bước 1.
3. Cấu hình:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Region**: cùng vùng với database ở Bước 2 (để tốc độ kết nối nhanh nhất).
4. Mục **Environment Variables** — thêm các biến sau:
   - `DATABASE_URL` → chọn "Add from Database" và trỏ tới `cswind-db` bạn tạo ở Bước 2
     (Render tự điền connection string đúng).
   - `NODE_ENV` → `production`
   - `JWT_SECRET` → một chuỗi ngẫu nhiên, dài, bí mật, dùng để ký phiên đăng nhập. Dùng chuỗi
     sau (đã tạo sẵn riêng cho app này, không dùng lại ở đâu khác):
     `49220916b235b40413bbbcc411ae70ac491045b7dd3023527c4ee55cfc74dd834c60a03f4cd5e2177c2ed0e0a8aaeae9`
     **Không dùng giá trị mặc định trong code** — app sẽ từ chối khởi động ở chế độ production
     nếu bạn quên bước này (đây là một biện pháp bảo vệ có chủ đích).
5. Bấm **Create Web Service**. Render sẽ build và chạy app — theo dõi log để chắc chắn dòng
   cuối là `CSWIND app listening on :<port>` (không có lỗi).
6. Khi deploy xong, Render cho bạn một URL dạng
   `https://cswind-welder-control.onrender.com` (tên tùy bạn đặt cho Web Service). Đây chính
   là URL bạn sẽ dùng ở Bước 5 (nhúng vào SharePoint) và Bước 6 (đặt làm Base URL trong app).

Lần khởi động đầu tiên, app tự tạo bảng dữ liệu (schema) và tự tạo một tài khoản quản trị mặc
định: **username `admin` / password `csw2026`**. Đăng nhập ngay bằng tài khoản này để bắt đầu.

**Quan trọng — đổi mật khẩu ngay sau lần đăng nhập đầu tiên**: vào tab Tài khoản (Accounts),
đổi mật khẩu tài khoản `admin` sang một mật khẩu mạnh hơn, hoặc tạo tài khoản superadmin mới
rồi xoá/hạ quyền tài khoản `admin` mặc định. Mật khẩu `csw2026` chỉ nên dùng để đăng nhập lần
đầu.

## Bước 4 — Dữ liệu 260 thợ hàn (tự động, không cần làm gì)

File `seed_data/welders_extracted.json` (dữ liệu thật của 260 thợ hàn) đã có sẵn trong repo
bạn upload ở Bước 1. Lần khởi động đầu tiên, app tự phát hiện database đang trống và **tự
nhập toàn bộ dữ liệu** — không cần chạy lệnh gì. Chỉ cần đợi 1-2 phút sau khi Web Service báo
"Live", rồi mở URL app và kiểm tra tab Tra cứu (Lookup) có đủ 260 thợ hàn là xong.

**Lưu ý về 2 tài khoản cũ**: dữ liệu cũ có 2 tài khoản "CSW-admin" và "admin" từ hệ thống
Claude Artifact trước đây — hai tài khoản này **không** được nhập vào hệ thống mới vì mật khẩu
của chúng dùng thuật toán mã hoá cũ, không tương thích và mật khẩu gốc (PIN) cũng không còn
được lưu lại được. Hãy dùng tài khoản `admin`/`csw2026` mới để đăng nhập, rồi tạo lại tài
khoản cho từng nhân viên qua tab Tài khoản.

## Bước 5 — Đặt Base URL trong Settings

Đăng nhập vào app (superadmin), vào tab Cài đặt (Settings), đặt **Base URL** = URL thật của
app trên Render (ví dụ `https://cswind-welder-control.onrender.com`). Giá trị này được dùng để
tạo nội dung mã QR cho từng thợ hàn.

## Bước 6 — Nhúng vào trang SharePoint

Trang đích:
https://cswind.sharepoint.com/sites/GBCProductionDivision/SitePages/Welder-Control-tool.aspx

1. Mở trang trên, bấm **Edit** (Chỉnh sửa) ở góc trên bên phải (cần quyền chỉnh sửa trang
   này — nếu bạn không có quyền, nhờ SharePoint site owner thực hiện các bước dưới).
2. Bấm dấu **+** để thêm một web part mới, tìm và chọn **Embed** (web part "Nhúng").
3. Trong ô nhập, dán URL app của bạn dạng iframe, ví dụ:
   ```
   <iframe src="https://cswind-welder-control.onrender.com" width="100%" height="900" style="border:none;"></iframe>
   ```
   (Một số phiên bản SharePoint chỉ cần dán thẳng URL, không cần thẻ `<iframe>` — web part
   Embed sẽ tự nhận diện. Nếu SharePoint chỉ cho dán link chứ không cho HTML, dán trực tiếp
   `https://cswind-welder-control.onrender.com`.)
4. Điều chỉnh chiều cao (height) cho vừa với nội dung trang — 900px là gợi ý ban đầu, có thể
   chỉnh lại sau khi xem thử.
5. Bấm **Publish** (Xuất bản) để lưu trang.

**Lưu ý về bảo mật trình duyệt**: một số trình duyệt (đặc biệt Safari, hoặc Chrome ở chế độ
riêng tư) có thể chặn cookie của iframe nếu domain của app khác domain của SharePoint — đây
gọi là giới hạn "third-party cookie". Nếu nhân viên đăng nhập được nhưng bị đăng xuất ngay khi
tải lại trang khi xem qua SharePoint, đây là nguyên nhân. Cách khắc phục nếu gặp vấn đề này:
mở app trực tiếp ở URL Render (không qua SharePoint) để làm việc, và dùng trang SharePoint chỉ
để có link truy cập nhanh — hoặc báo lại để cấu hình cookie `SameSite=None; Secure` thay cho
cấu hình mặc định hiện tại (`SameSite=Lax`), đánh đổi lấy khả năng hoạt động tốt hơn trong
iframe.

## Bước 7 — Gửi email nhắc nhở tự động mỗi thứ 2 hàng tuần

Ứng dụng có thể tự gửi email (danh sách thợ hàn sắp/đã hết hạn chứng chỉ) tới các địa chỉ
trong Cài đặt (Settings > emails) — thật sự gửi qua máy chủ, không cần mở trình duyệt.

### 7a — Lấy App Password cho hộp thư Outlook/Office 365

1. Chọn một hộp thư sẽ dùng để gửi (ví dụ `noreply@cswind.com.vn` hoặc hộp thư của bạn).
2. Đăng nhập https://account.microsoft.com/security → tìm mục **App passwords / Mật khẩu
   ứng dụng** (nếu hộp thư có bật xác thực 2 lớp — thường là bắt buộc ở công ty).
3. Tạo một App Password mới, đặt tên gợi nhớ (ví dụ "CSWIND Welder App"), copy lại chuỗi
   mật khẩu hiện ra (chỉ hiện một lần).

**Nếu không thấy mục "App passwords"**: có thể do bộ phận IT của CSWIND đã tắt tính năng
xác thực SMTP cơ bản (Microsoft đang dần tắt tính năng này cho toàn bộ khách hàng doanh
nghiệp) — trường hợp này cần nhờ IT cấp quyền qua Azure AD App Registration (phức tạp hơn,
báo lại nếu gặp trường hợp này để tôi hướng dẫn tiếp theo hướng khác).

### 7b — Thêm biến môi trường trên Render

Vào Web Service `cswind-weldercontrol` → **Environment**, thêm:

- `SMTP_USER` → hộp thư gửi, ví dụ `noreply@cswind.com.vn`
- `SMTP_PASS` → App Password vừa tạo ở Bước 7a (không phải mật khẩu đăng nhập thường)
- `MAIL_FROM` → (tuỳ chọn) địa chỉ hiển thị ở "Từ" — để trống thì dùng luôn `SMTP_USER`
- `REMINDER_SECRET` → một chuỗi bí mật tự đặt (dùng cho Bước 7c) — ví dụ `cswind-remind-2026-xyz`

Bấm **Save, rebuild, and deploy**.

Sau khi deploy xong, đăng nhập app bằng tài khoản superadmin, vào tab Quản trị, tìm nút
**"Gửi thử ngay (email thật)"** trong mục nhắc nhở — bấm thử để xác nhận email gửi thành
công tới các địa chỉ trong Cài đặt.

### 7c — Hẹn giờ tự động mỗi thứ 2 (dùng dịch vụ miễn phí bên ngoài)

Vì gói Render miễn phí tự "ngủ", cần một dịch vụ bên ngoài "đánh thức" app đúng giờ hẹn:

1. Vào https://cron-job.org, tạo tài khoản miễn phí (email + mật khẩu).
2. Sau khi đăng nhập, bấm **Create cronjob**.
3. Điền:
   - **Title**: `CSWIND weekly reminder`
   - **URL**: `https://cswind-weldercontrol.onrender.com/api/reminders/send`
   - **Request method**: `POST`
   - Kéo xuống mục **Advanced** (hoặc **Headers**) → thêm một header:
     - Tên (Name): `X-Reminder-Secret`
     - Giá trị (Value): đúng chuỗi bạn đặt ở `REMINDER_SECRET` Bước 7b
   - **Schedule**: chọn chạy vào **Thứ 2 (Monday)**, giờ Việt Nam khoảng 8:00 sáng (cron-job.org
     dùng UTC — 8:00 giờ VN = 01:00 UTC, tương ứng biểu thức `0 1 * * 1`)
4. Bấm **Create** / **Save**.

Từ đó, mỗi thứ 2 lúc 8h sáng, cron-job.org sẽ gọi vào app và app tự gửi email nhắc nhở —
không cần mở trình duyệt, không cần Claude.

**Muốn app luôn thức, hẹn giờ chạy chính xác hơn**: nâng cấp Web Service lên gói trả phí
(~$7/tháng, xem "Ghi chú về gói Render" cuối tài liệu) — khi đó app tự hẹn giờ chính xác bên
trong, bước 7c ở trên trở thành dự phòng chứ không bắt buộc.

## Bước 8 — Nhiều entity (CSW-VN, CSW-HQ, CSW-TR...)

App giờ hỗ trợ nhiều "entity" (chi nhánh/công ty con) trong cùng một app, mỗi entity có dữ
liệu thợ hàn riêng biệt, nhưng dùng chung một app/đường link/tài khoản đăng nhập.

**Không cần làm gì để bật tính năng này** — khi deploy bản cập nhật, app tự tạo sẵn 7 entity
mặc định: `CSW-VN` (CSW Việt Nam — nơi 260 thợ hàn hiện tại đang nằm), `CSW-HQ`, `CSW-TR`,
`CSW-AM`, `CSW-CN`, `CSW-TW`, `CSW-PT`. Cả 260 thợ hàn hiện có tự động thuộc về `CSW-VN` —
không có dữ liệu nào bị mất hay xáo trộn.

Cách dùng:

- **Tab Tra cứu**: một hàng nút entity (CSW-VN, CSW-HQ, ...) hiện phía trên khung tìm kiếm.
  Bấm vào một entity để chỉ xem thợ hàn thuộc entity đó — số liệu thống kê, danh sách, bộ lọc
  quy trình/công đoạn đều tự lọc theo entity đang chọn.
- **Tab Quản trị**: sau khi đăng nhập, cùng một hàng nút entity hiện ở đầu trang — chọn entity
  nào ở đây cũng đồng bộ với tab Tra cứu (chọn 1 nơi, áp dụng cả 2 nơi). Danh sách tổng, thêm/
  sửa/xoá thợ hàn, nhập Excel... tất cả đều thao tác trên entity đang được chọn.
- **Thêm entity mới**: chỉ tài khoản **Quản trị cấp cao** (superadmin) mới thấy nút "+ Entity
  mới" cuối hàng nút (ở cả 2 tab). Bấm vào, nhập mã (vd `CSW-JP`, chỉ chữ/số/gạch ngang) rồi
  nhập tên hiển thị (vd `CSW Japan`) — entity mới xuất hiện ngay, không cần deploy lại.
  Tài khoản "editor" và "chỉ xem" không thấy nút này (không thể tự thêm entity).
- **Xoá entity tạo nhầm**: cũng chỉ superadmin thấy nút "Xoá entity" cạnh nút "+" — bấm vào
  entity muốn xoá để chọn nó, rồi bấm "Xoá entity". Để tránh mất dữ liệu thợ hàn thật, nút này
  **tự động bị khoá (mờ đi)** nếu entity đang chọn còn thợ hàn nào bên trong, hoặc nếu đó là
  entity duy nhất còn lại — phải chuyển hết thợ hàn sang entity khác (sửa trong form thêm/sửa
  thợ hàn, đổi ô "Entity") hoặc xoá hết thợ hàn đó trước, thì nút xoá entity mới bấm được.
  Muốn đổi *tên* một entity đã có (không xoá), báo lại Claude để bổ sung — hiện tại giao diện
  mới hỗ trợ thêm/xoá, chưa hỗ trợ đổi tên.
- **Thêm/sửa thợ hàn**: khi mở form thêm/sửa thợ hàn ở tab Quản trị, có thêm ô chọn "Entity" —
  mặc định là entity đang chọn, có thể đổi sang entity khác ngay trong form nếu cần chuyển thợ
  hàn đó sang entity khác.
- **Mã thợ hàn (ID) vẫn phải là duy nhất trên toàn bộ hệ thống**, không phân biệt theo entity —
  hai entity khác nhau không thể có cùng một mã thợ hàn (vd `CS006` chỉ tồn tại ở một entity).
- **QR code / link riêng của từng thợ hàn không đổi** — vẫn theo mã thợ hàn
  (`.../<mã thợ hàn>`), không phân biệt entity trong đường link.
- **Lưu ý về email nhắc nhở tự động (Bước 7)**: email nhắc nhở hàng tuần hiện vẫn gửi chung
  cho *tất cả* các entity trong một email duy nhất, chưa tách riêng theo từng entity. Nếu cần
  tách email riêng theo entity (vd CSW-HQ tự nhận email riêng), báo lại Claude để bổ sung.

## Việc cần làm sau khi deploy xong

- [ ] Đổi mật khẩu tài khoản `admin` mặc định (hoặc tạo superadmin mới, xoá tài khoản mặc định)
- [ ] Import dữ liệu 260 thợ hàn (Bước 4)
- [ ] Đặt Base URL trong Settings (Bước 5)
- [ ] Tạo tài khoản cho từng nhân viên cần chỉnh sửa dữ liệu (vai trò "editor") qua tab Tài khoản
- [ ] Nhúng vào trang SharePoint (Bước 6)
- [ ] Test thử: đăng nhập bằng một tài khoản editor mới tạo, thử thêm/sửa một thợ hàn, xác
      nhận thay đổi lưu lại thật (tải lại trang để chắc chắn)
- [ ] Test thử luồng khách hàng: quét mã QR (hoặc mở link tra cứu) mà không đăng nhập, xác
      nhận xem được thông tin chứng chỉ — quét QR giờ sẽ mở thẳng trang riêng của thợ hàn đó
- [ ] Cấu hình email nhắc nhở tự động (Bước 7), bấm "Gửi thử ngay" để xác nhận hoạt động
- [ ] Nếu công ty có nhiều chi nhánh (CSW-HQ, CSW-TR...), thử bấm qua lại các nút entity ở tab
      Tra cứu/Quản trị (Bước 8) để quen với cách chuyển đổi

## Ghi chú về gói Render (Free vs trả phí)

Gói **Free** của Render sẽ tự "ngủ" (sleep) sau ~15 phút không có ai truy cập, và mất khoảng
30-50 giây để "thức dậy" ở lượt truy cập tiếp theo — nếu nhân viên quét mã QR và phải chờ, đây
là nguyên nhân. Database Free của Render cũng có giới hạn thời gian lưu trữ (thường bị xoá sau
90 ngày nếu không nâng cấp). Nếu app này sẽ được dùng thường xuyên trong công việc thực tế của
CSWIND (không chỉ để thử nghiệm), nên nâng cấp Web Service và Database lên gói trả phí thấp
nhất (Starter, khoảng $7/tháng mỗi loại tại thời điểm viết tài liệu này — kiểm tra giá hiện tại
trên render.com/pricing vì giá có thể thay đổi) để tránh tình trạng "ngủ" và mất dữ liệu.

## Nếu gặp lỗi khi deploy

- **App không khởi động, log báo "FATAL: set a real JWT_SECRET..."**: bạn chưa đặt biến môi
  trường `JWT_SECRET` ở Bước 3 — quay lại thêm.
- **App khởi động nhưng không kết nối được database**: kiểm tra lại biến `DATABASE_URL` đã
  được link đúng tới database ở Bước 2 chưa (vào tab Environment của Web Service để xem).
- **Trang trắng khi mở URL app**: xem log của Web Service trên Render Dashboard để tìm lỗi cụ
  thể; thường là do build chưa xong hoặc lỗi cú pháp — báo lại thông tin lỗi trong log để được
  hỗ trợ.
